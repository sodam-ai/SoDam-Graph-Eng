/**
 * scan.mjs — 형제 저장소를 **읽기 전용**으로 훑어 실측한다
 *
 * 규격:
 *   02_DATA_MODEL.md §Snapshot (활동 축 + 정체 축 2개)
 *   02_DATA_MODEL.md §Milestone 초기 데이터 §1층 추출 (공통분모만)
 *   08_SECURITY_SPEC.md S-4 (비밀정보 비수집) · S-5 (자원 상한)
 *
 * 🔴 읽기 전용 불변식 (S-3 ①겹):
 *   이 파일은 **쓰기 API 를 직접 import 하지 않습니다.**
 *   snapshot.json 기록은 `safeWrite.mjs` 한 곳만 통과합니다.
 */

import { readFileSync, lstatSync, existsSync, readdirSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lastCommit, dirtyCount } from './gitSafe.mjs';
import { loadGraph, LIMITS } from './loadGraph.mjs';
import { resolveAll } from './resolve.mjs';
import { safeWrite, REPO_ROOT } from './safeWrite.mjs';

/** S-4.1 — 읽지도, 이름을 기록하지도 않는 파일 (존재 사실도 정보다: S-4.2) */
const SECRET_PATTERNS = [
  /^\.env/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /^id_rsa/i,
  /^credentials/i,
  /secret/i,
  /^\.npmrc$/i,
  /^\.netrc$/i,
  /\.keystore$/i,
];

export function isSecretName(name) {
  return SECRET_PATTERNS.some((re) => re.test(name));
}

/** S-4.4 — 커밋 제목의 시크릿 패턴 마스킹 */
const SECRET_TOKENS = [
  /ghp_[A-Za-z0-9]{6,}/g,
  /github_pat_[A-Za-z0-9_]{6,}/g,
  /\bsk-[A-Za-z0-9]{6,}/g,
  /xox[baprs]-[A-Za-z0-9-]{6,}/g,
  /\bAKIA[0-9A-Z]{8,}/g,
  /\bAIza[0-9A-Za-z_-]{10,}/g,
  /-----BEGIN[^\n]*/g,
];

export function maskSecrets(text) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const re of SECRET_TOKENS) out = out.replace(re, '[REDACTED]');
  return out;
}

/** 추적 파일 후보 (시크릿 이름은 애초에 목록에 넣지 않는다 — S-4.2) */
const TRACKING_CANDIDATES = ['CHECKPOINT.md', 'AUDIT.log', 'progress.txt', 'tasks/todo.md'];

/**
 * 🔴 로컬 시각 기준 문자열 (UTC 금지)
 *
 * 왜 필요한가 — 2026-08-02 실측으로 잡은 버그:
 *   `toISOString()` 은 **UTC** 를 돌려주는데 `new Date("...T13:48:29")` 는 **로컬**로 해석합니다.
 *   그래서 ① 캐시가 항상 "오래됨"으로 판정돼 매번 재스캔했고(1초 예산 위협)
 *        ② 출력의 `[HH:MM 기준]` 이 9시간 어긋났으며(규약 D1 무력화)
 *        ③ 파일 수정일이 하루 밀려 나왔습니다(활동 축 오판).
 *   `02_DATA_MODEL.md` 의 예시(`2026-08-02T01:40:00`)도 **로컬 시각**이므로 여기에 맞춥니다.
 */
const pad2 = (n) => String(n).padStart(2, '0');

export function localDateTime(d) {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

export function localDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function daysBetween(isoDate, nowMs) {
  if (!isoDate) return null;
  const then = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  return Math.max(0, Math.floor((nowMs - then.getTime()) / 86400000));
}

/** 파일 최종 수정일 (YYYY-MM-DD). 링크·과대 파일은 건너뜀 */
function mtimeDate(file, limits) {
  try {
    const st = lstatSync(file);
    if (st.isSymbolicLink() || !st.isFile()) return null; // S-2.4
    if (st.size > limits.MAX_FILE_BYTES) return null; // S-5.5
    return localDate(st.mtime);
  } catch {
    return null;
  }
}

/**
 * 🆕 1.5층 추출 (W-2 · 02 §1.5층 추출 · 08 S-4.3 예외 조항)
 *
 * 왜 필요한가 — 개수만 세면 "미완료 7건"만 말하고 그 7건이 뭔지는 버립니다.
 * `/graph-next` 가 7형제 중 6곳에 "모르겠습니다"만 반복하던 원인이 이것입니다.
 *
 * 규칙 (02 §1.5층 L-1~L-5):
 *   · 줄 시작 체크박스만 (표 셀·코드블록 안 `[ ]` 는 제외)
 *   · 최대 3건, 120자 초과 시 자름
 *   · S-4.4 와 동일한 시크릿 마스킹
 *   · graph-state.json 에는 절대 넣지 않는다 (publish.mjs 의 화이트리스트가 구조적으로 차단)
 */
function stripFencedCode(text) {
  return text.replace(/```[\s\S]*?```/g, '');
}

const OPEN_ITEM_RE = /^[ \t]*(?:[-*]\s+)?\[ \][ \t]*(.+)$/gm;

/**
 * 🔧 오탐 수정 (2026-08-03, 사용자 확인 후 즉시 반영) — `open_checkboxes` 개수 자체가 오염돼 있었습니다.
 *
 * 실측으로 드러난 문제: 줄 앵커 없이 `/\[ \]/g` 로 전체 텍스트를 세면, "체크박스가 `[ ]`
 * 미착수로 남아있던 것을 정정" 같은 **과거를 서술하는 문장 속 인용**까지 미완료로 오인식합니다.
 * (실측: 소담에이전틱엔지니어링·소담프롬프트엔지니어링이 이 오탐으로 각각 2·3건이 잡혔으나,
 *  실제 줄 시작 체크박스는 0건이었습니다.)
 *
 * 그래서 **개수(open_checkboxes)와 인용(open_items)을 같은 필터로 통일**합니다 — 인용에 안
 * 뽑히는 항목이 개수에는 들어가는 모순을 없애기 위함입니다. 표시 인용은 최대 3건이지만
 * 개수는 전량을 셉니다.
 */
export function extractOpenItems(body) {
  const stripped = stripFencedCode(body);
  let count = 0;
  const items = [];
  let m;
  OPEN_ITEM_RE.lastIndex = 0;
  while ((m = OPEN_ITEM_RE.exec(stripped))) {
    const raw = m[1].trim();
    if (raw.length < 3) continue; // 의미 없는 짧은 조각 제외 — 개수·인용 동일 필터
    count++;
    if (items.length < 3) {
      let text = maskSecrets(raw); // S-4.4 와 동일 마스킹 (08 S-4.3 예외 조건 ②)
      if (text.length > 120) text = `${text.slice(0, 120)}…`; // 조건 ③
      items.push(text);
    }
  }
  return { count, items };
}

/**
 * 1층 추출 — **전 형제 공통분모만** (02 §2층 추출)
 * 🔴 S-4.3: 숫자·날짜·개수만 뽑고 **본문 문자열은 스냅샷에 저장하지 않는다.**
 * 🆕 단, `open_items`(1.5층)는 08 S-4.3 예외 조항에 따라 허용된다 (최대 3건).
 */
export function extractLayer1(repoRoot, limits = LIMITS) {
  const cp = resolvePath(repoRoot, 'CHECKPOINT.md');
  const out = {
    checkpoint_mtime: null,
    checkpoint_lines: 0,
    done_markers: 0,
    open_checkboxes: 0,
    open_items: [], // 🆕 1.5층 — W-2
    has_done_when: false,
    oversized: false,
  };
  if (!existsSync(cp)) return out;

  let st;
  try {
    st = lstatSync(cp);
  } catch {
    return out;
  }
  if (st.isSymbolicLink() || !st.isFile()) return out; // S-2.4
  if (st.size > limits.MAX_FILE_BYTES) {
    out.oversized = true; // S-5.5 — 읽지 않고 "파일이 너무 큼"으로 표시
    out.checkpoint_mtime = localDate(st.mtime);
    return out;
  }

  let body;
  try {
    body = readFileSync(cp, 'utf8');
  } catch {
    return out;
  }

  out.checkpoint_mtime = localDate(st.mtime);
  out.checkpoint_lines = body.split('\n').length;
  out.done_markers = (body.match(/✅|완료|\bdone\b/gi) ?? []).length;
  // 🔧 개수(open_checkboxes)와 인용(open_items)을 하나의 정확한 필터로 통일 (아래 함수 주석 참조)
  const oi = extractOpenItems(body);
  out.open_checkboxes = oi.count;
  out.open_items = oi.items; // 🆕 W-2 — 개수만 아니라 원문도 (최대 3건)
  out.has_done_when = /done[-_ ]when/i.test(body);
  return out;
}

/** 추적 파일 목록 — 시크릿 이름은 넣지 않는다 (S-4.2) */
function trackingFiles(repoRoot) {
  const found = [];
  for (const rel of TRACKING_CANDIDATES) {
    if (isSecretName(rel)) continue;
    if (existsSync(resolvePath(repoRoot, rel))) found.push(rel);
  }
  return found;
}

/** 저장소 루트의 파일 시각 중 가장 최근 (활동 축 보조 — 커밋이 없는 형제 대비) */
function newestFileDate(repoRoot, limits) {
  let newest = null;
  try {
    for (const e of readdirSync(repoRoot, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      if (isSecretName(e.name)) continue; // S-4.1
      const d = mtimeDate(resolvePath(repoRoot, e.name), limits);
      if (d && (!newest || d > newest)) newest = d;
    }
  } catch {
    /* 무시 */
  }
  return newest;
}

/**
 * 7형제 실측.
 * @returns {{snapshot: object, resolveStats: object}}
 */
export function scanAll(graph = loadGraph(), now = new Date()) {
  const { results, stats } = resolveAll(graph);
  const byId = new Map(results.map((r) => [r.id, r]));
  const scannedAt = localDateTime(now);
  const nowMs = now.getTime();

  // 형제별 대표 마일스톤 (정체 축 계산용) — seq 가 가장 작은 미완료
  // 🔧 선행 버그 수정(M9 착수 전, 2026-08-03): judgeProject·collectMismatches·
  //    mermaid statusOf 는 전부 "seq 최솟값 미완료"를 대표로 쓰는데, 여기만
  //    "last_moved_at 최솟값"을 썼다. 그 결과 화면에 "M5가 9일째"처럼 표시되는
  //    ID와, 실제 9일이 나온 마일스톤이 서로 다를 수 있음이 M11 검증 중 실측으로
  //    드러났다(seq 가 먼 임시 마일스톤이 낀 상황에서 재현). M9 의 점수 계산이
  //    이 값을 그대로 쓰므로 착수 전에 기준을 통일한다.
  const msByProject = new Map();
  for (const m of graph.milestones) {
    if (m.state === 'done') continue;
    const cur = msByProject.get(m.project_id);
    if (!cur || (m.seq ?? 0) < (cur.seq ?? 0)) msByProject.set(m.project_id, m);
  }

  const projects = graph.projects.map((p) => {
    const r = byId.get(p.id) ?? { resolve_status: 'lost', repo_root: null };
    const rec = {
      project_id: p.id,
      scanned_at: scannedAt,
      resolve_status: r.resolve_status,
      repo_root: r.repo_root ?? null,
      folder_path: r.folder_path ?? null,
      prd_path: r.prd_path ?? null,
      checkpoint_path: r.checkpoint_path ?? null,
      plugin_cache_path: r.plugin_cache_path ?? null,
      installed: r.installed ?? false,
      git_last_commit_date: null,
      git_last_commit_subject: null,
      git_dirty_count: null,
      tracking_files: [],
      coarse: null,
      days_since_activity: null, // 활동 축
      days_in_state: null, // 정체 축
      state: null,
      milestone_id: null,
      mismatch: [],
    };

    if (!r.repo_root) {
      rec.mismatch.push(
        r.resolve_status === 'rejected_path'
          ? '경로 거부 — markers 가 안전하지 않음 (08 S-2)'
          : '경로 유실 — 재탐색 필요'
      );
      return rec;
    }

    // git 실측
    const c = lastCommit(r.repo_root);
    if (c) {
      rec.git_last_commit_date = c.date;
      rec.git_last_commit_subject = maskSecrets(c.subject); // S-4.4
    }
    rec.git_dirty_count = dirtyCount(r.repo_root);
    rec.tracking_files = trackingFiles(r.repo_root);
    rec.coarse = extractLayer1(r.repo_root);

    // 활동 축 — 커밋과 파일 시각 중 **더 최근** 값 (02 §NEEDS CLARIFICATION 해소분)
    const activity = [
      rec.git_last_commit_date,
      newestFileDate(r.repo_root, LIMITS),
      rec.coarse.checkpoint_mtime,
    ]
      .filter(Boolean)
      .sort()
      .pop();
    rec.days_since_activity = daysBetween(activity, nowMs);

    // 정체 축 — 같은 state 에 머문 기간
    const ms = msByProject.get(p.id);
    if (ms) {
      rec.days_in_state = daysBetween(ms.last_moved_at, nowMs);
      rec.state = ms.state;
      rec.milestone_id = ms.id;
    }

    // 대조 (02 §흐름 4 — 조용히 덮어쓰지 않고 어긋났다고 표시)
    if (ms && ms.state !== 'coarse' && rec.coarse.open_checkboxes > 0) {
      rec.mismatch.push(`계획 상태=${ms.state} · 실측=미완료 ${rec.coarse.open_checkboxes}건 남음`);
    }
    if (rec.days_since_activity !== null && rec.days_since_activity >= graph.config.stall_days) {
      rec.mismatch.push(
        `활동 없음 ${rec.days_since_activity}일 (기준 ${graph.config.stall_days}일)`
      );
    }
    if (rec.coarse.oversized) {
      rec.mismatch.push('CHECKPOINT.md 파일이 너무 큼 (5MB 초과) — 1층 추출 생략');
    }
    return rec;
  });

  return { snapshot: { version: 1, scanned_at: scannedAt, projects }, resolveStats: stats };
}

/** snapshot.json 기록 — 쓰기는 safeWrite 만 통과 (S-3 ②겹) */
export function writeSnapshot(snapshot) {
  return safeWrite(
    resolvePath(REPO_ROOT, 'data', 'snapshot.json'),
    `${JSON.stringify(snapshot, null, 2)}\n`
  );
}

/** CLI: node lib/scan.mjs */
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const graph = loadGraph();
  const { snapshot, resolveStats } = scanAll(graph);
  const path = writeSnapshot(snapshot);
  const nameOf = new Map(graph.projects.map((p) => [p.id, p.name_ko]));
  console.log(`스캔 ${snapshot.scanned_at} · 디렉터리 ${resolveStats.dirsVisited}개 방문`);
  for (const r of snapshot.projects) {
    const act = r.days_since_activity === null ? '-' : `${r.days_since_activity}일`;
    const st = r.days_in_state === null ? '-' : `${r.days_in_state}일`;
    console.log(
      `  ${r.resolve_status.padEnd(16)} ${(nameOf.get(r.project_id) ?? r.project_id).padEnd(22)}` +
        ` 활동${act.padStart(5)} 정체${st.padStart(5)}` +
        ` 추적[${r.tracking_files.join(',') || '없음'}]` +
        (r.mismatch.length ? `  ⚠ ${r.mismatch.join(' / ')}` : '')
    );
  }
  console.log(`\n기록: ${path}`);
}
