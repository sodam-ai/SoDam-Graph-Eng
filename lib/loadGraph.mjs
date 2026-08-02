/**
 * loadGraph.mjs — graph.json 로드 + 입력 검증
 *
 * 규격:
 *   08_SECURITY_SPEC.md S-7 (입력 검증 — 신뢰 경계)
 *     "graph.json 값을 신뢰하지 않는다."
 *     수용 기준: id 에 `../` → **로드 실패 + 어느 필드가 잘못됐는지 표시**
 *   08_SECURITY_SPEC.md S-2.3 (경로 조작 차단)
 *     "markers[].file 은 상대 경로만 허용. `..`·절대 경로·드라이브 문자로
 *      시작하면 **로드 시점에 거부**"
 *   02_DATA_MODEL.md §최상위 구조 (평면형 + 전역 config)
 *
 * 🔴 설계 판단 — 어디까지 throw 하고 어디부터 표시만 할 것인가:
 *   · **구조·식별자 오류는 throw** (S-7 수용 기준이 "로드 실패"를 요구)
 *   · **markers 의 위험 경로는 throw 하지 않고 `unsafe` 로 표시**
 *     → resolve 가 그 형제를 `rejected_path` 로 판정합니다 (02 §resolve_status).
 *     한 형제의 변조된 marker 때문에 **나머지 6형제 판정까지 막으면 안 됩니다.**
 */

import { readFileSync } from 'node:fs';
import { resolve as resolvePath, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_GRAPH_PATH = resolvePath(HERE, '..', 'data', 'graph.json');

/** S-7 검증 규칙 */
const RE_ID = /^[a-z][a-z0-9-]{2,40}$/;
const RE_REMOTE = /^[\w.-]+\/[\w.-]+$/;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATES = new Set([
  'todo',
  'doing',
  'verified',
  'blocked',
  'done',
  'coarse',
  'done_candidate',
]);
const EDGE_TYPES = new Set(['next', 'depends_on', 'shares', 'conflicts']);

/** S-5 자원 상한 — config 에 값이 없을 때의 안전한 기본값 */
export const LIMITS = {
  MAX_DEPTH: 4, // S-5.1
  MAX_DIRS: 500, // S-5.2
  SESSION_BUDGET_MS: 1000, // S-5.3
  GIT_TIMEOUT_MS: 5000, // S-5.4
  MAX_FILE_BYTES: 5 * 1024 * 1024, // S-5.5
  MAX_STATE_BYTES: 4 * 1024, // S-5.6
};

class GraphValidationError extends Error {
  constructor(field, detail) {
    super(`graph.json 검증 실패 — ${field}: ${detail}`);
    this.name = 'GraphValidationError';
    this.field = field;
  }
}

/**
 * S-2.3: markers[].file 이 안전한 상대 경로인지.
 * 거부: `..` 포함 · 절대 경로 · 드라이브 문자(`C:`) · 루트 시작(`/`, `\`) · 빈 값
 */
export function isSafeRelative(p) {
  if (typeof p !== 'string' || p.length === 0) return false;
  if (p.includes('..')) return false;
  if (isAbsolute(p)) return false;
  if (/^[A-Za-z]:/.test(p)) return false;
  if (/^[\\/]/.test(p)) return false;
  if (p.includes('\0')) return false;
  return true;
}

/** 최상위 구조 검사 (02 §최상위 구조 — 평면형 6키) */
function validateShape(g) {
  const need = ['version', 'config', 'projects', 'milestones', 'edges', 'blockers'];
  for (const k of need) {
    if (!(k in g)) throw new GraphValidationError('최상위', `필수 키 "${k}" 없음`);
  }
  if (!Array.isArray(g.projects) || g.projects.length === 0) {
    throw new GraphValidationError('projects', '비어 있지 않은 배열이어야 함');
  }
  for (const k of ['milestones', 'edges', 'blockers']) {
    if (!Array.isArray(g[k])) throw new GraphValidationError(k, '배열이어야 함');
  }
  if (!g.config || typeof g.config !== 'object') {
    throw new GraphValidationError('config', '객체여야 함');
  }
  if (!Array.isArray(g.config.search_roots) || g.config.search_roots.length === 0) {
    throw new GraphValidationError('config.search_roots', '비어 있지 않은 배열이어야 함');
  }
}

function validateProjects(g) {
  const seen = new Set();
  for (const [i, p] of g.projects.entries()) {
    const at = `projects[${i}]`;
    if (!RE_ID.test(p.id ?? '')) {
      throw new GraphValidationError(`${at}.id`, `"${p.id}" — 허용 형식 ${RE_ID}`);
    }
    if (seen.has(p.id)) throw new GraphValidationError(`${at}.id`, `중복 id "${p.id}"`);
    seen.add(p.id);

    if (!RE_REMOTE.test(p.repo_remote ?? '')) {
      throw new GraphValidationError(
        `${at}.repo_remote`,
        `"${p.repo_remote}" — owner/repo 형식이어야 함`
      );
    }
    for (const k of ['name_ko', 'name_en', 'role', 'status']) {
      if (typeof p[k] !== 'string' || p[k].length === 0) {
        throw new GraphValidationError(`${at}.${k}`, '비어 있지 않은 문자열이어야 함');
      }
    }
    if (!Array.isArray(p.markers) || p.markers.length === 0) {
      throw new GraphValidationError(`${at}.markers`, '비어 있지 않은 배열이어야 함');
    }

    // S-2.3 — 위험 경로는 throw 하지 않고 표시만 한다 (설계 판단은 파일 상단 주석 참조)
    p.markers = p.markers.map((m) => {
      const safe = isSafeRelative(m?.file) && typeof m?.contains === 'string';
      return { ...m, unsafe: !safe };
    });
    p.has_unsafe_marker = p.markers.some((m) => m.unsafe);
  }
}

function validateMilestones(g) {
  const pids = new Set(g.projects.map((p) => p.id));
  const seen = new Set();
  for (const [i, m] of g.milestones.entries()) {
    const at = `milestones[${i}]`;
    if (typeof m.id !== 'string' || m.id.length === 0) {
      throw new GraphValidationError(`${at}.id`, '문자열이어야 함');
    }
    if (seen.has(m.id)) throw new GraphValidationError(`${at}.id`, `중복 id "${m.id}"`);
    seen.add(m.id);
    if (!pids.has(m.project_id)) {
      throw new GraphValidationError(`${at}.project_id`, `없는 형제 "${m.project_id}"`);
    }
    if (!STATES.has(m.state)) {
      throw new GraphValidationError(`${at}.state`, `"${m.state}" — 허용: ${[...STATES].join('·')}`);
    }
    if (!RE_DATE.test(m.last_moved_at ?? '')) {
      throw new GraphValidationError(`${at}.last_moved_at`, `"${m.last_moved_at}" — YYYY-MM-DD`);
    }
  }
  return seen;
}

function validateEdges(g, milestoneIds) {
  for (const [i, e] of g.edges.entries()) {
    const at = `edges[${i}]`;
    if (!EDGE_TYPES.has(e.type)) {
      throw new GraphValidationError(
        `${at}.type`,
        `"${e.type}" — 허용: ${[...EDGE_TYPES].join('·')}`
      );
    }
    for (const k of ['from', 'to']) {
      if (!milestoneIds.has(e[k])) {
        throw new GraphValidationError(`${at}.${k}`, `없는 마일스톤 "${e[k]}"`);
      }
    }
  }
}

/**
 * graph.json 을 읽고 검증한다.
 * @param {string} [path] 기본값 = data/graph.json
 * @returns {object} 검증된 그래프 (markers 에 `unsafe` 플래그가 추가됨)
 */
export function loadGraph(path = DEFAULT_GRAPH_PATH) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    // S-13.4: 스택 트레이스 대신 사람이 읽을 한 줄
    throw new Error(`graph.json 을 읽을 수 없습니다 — ${path}`);
  }

  let g;
  try {
    g = JSON.parse(raw);
  } catch (err) {
    throw new Error(`graph.json 이 올바른 JSON 이 아닙니다 — ${err.message}`);
  }

  validateShape(g);
  validateProjects(g);
  const milestoneIds = validateMilestones(g);
  validateEdges(g, milestoneIds);

  // config 기본값 보정 (문서 규격 수치와 동일)
  g.config = {
    scan_filter: '*SoDam-*-Eng*',
    stall_days: 7,
    coarse_confidence: 0.7,
    session_output_max_lines: 3,
    session_budget_ms: LIMITS.SESSION_BUDGET_MS,
    ...g.config,
  };

  // S-7: 환경변수 SODAM_GRAPH_ROOT 는 테스트 격리용 (S-13.7). 존재 확인은 resolve 가 한다.
  const override = process.env.SODAM_GRAPH_ROOT;
  if (override) {
    g.config.search_roots = [resolvePath(override)];
    g.config._root_overridden = true;
  }

  return g;
}

export const _internal = { RE_ID, RE_REMOTE, RE_DATE, STATES, EDGE_TYPES, GraphValidationError };
