/**
 * publish.mjs — `~/.sodam/graph-state.json` 공유 발행
 *
 * 규격:
 *   02_DATA_MODEL.md §공유 발행 · 07_FAMILY_COEXIST.md §5 발행 계약
 *   08_SECURITY_SPEC.md S-6 (공유 파일 최소 노출)
 *
 * 🔴 이게 없으면 "7형제 시너지"가 성립하지 않습니다.
 *   graph.json 은 소담그래프엔지니어링 저장소 안에만 있어서 **다른 6형제가 못 읽습니다.**
 *   정본 `family-synergy.md` §4의 `isFamilyAlive(name)`("공통 표준화 필요·미구현")
 *   자리를 이 파일이 채웁니다.
 *
 * S-6 요약:
 *   S-6.1 화이트리스트 **6필드만**   S-6.2 커밋 제목·evidence·done_when 미포함
 *   S-6.3 원자적 교체               S-6.5 쓰기 실패해도 본체는 정상 동작
 */

import { pathToFileURL } from 'node:url';
import { loadGraph, loadGraphOrExit, LIMITS } from './loadGraph.mjs';
import { scanAll } from './scan.mjs';
import { safeWriteAtomic, SHARED_STATE, SHARED_DIR } from './safeWrite.mjs';

/**
 * S-6.1 — 발행 내용은 **정확히 이 6필드**만.
 * 🔴 필드를 늘리지 마십시오. `graph-state.json` 은 6형제가 읽는 유일한 외부 노출 지점이라
 *    유출 반경이 가장 넓습니다. 특히 **커밋 제목은 절대 넣지 않습니다** (S-4.5).
 */
const WHITELIST = ['id', 'name_ko', 'repo_root', 'state', 'resolve_status', 'scanned_at'];

export function buildState(graph, snapshot) {
  const nameOf = new Map(graph.projects.map((p) => [p.id, p.name_ko]));
  const projects = snapshot.projects.map((r) => {
    const full = {
      id: r.project_id,
      name_ko: nameOf.get(r.project_id) ?? r.project_id,
      repo_root: r.repo_root,
      state: r.state,
      resolve_status: r.resolve_status,
      scanned_at: r.scanned_at,
    };
    // 화이트리스트 밖 키가 실수로 끼어드는 것을 구조적으로 차단
    const out = {};
    for (const k of WHITELIST) out[k] = full[k] ?? null;
    return out;
  });

  return {
    version: 1,
    produced_by: 'sodam-graph',
    scanned_at: snapshot.scanned_at,
    projects,
  };
}

/**
 * 발행한다.
 * @returns {{ok: true, path: string, bytes: number} | {ok: false, reason: string}}
 *
 * 🔴 S-6.5: **실패해도 throw 하지 않습니다.** 발행은 부가 기능이라
 *   실패가 판정(본체 기능)을 막으면 안 됩니다.
 */
export function publish(graph, snapshot) {
  try {
    const state = buildState(graph, snapshot);
    const body = `${JSON.stringify(state, null, 2)}\n`;
    const bytes = Buffer.byteLength(body, 'utf8');

    if (bytes > LIMITS.MAX_STATE_BYTES) {
      return { ok: false, reason: `발행 크기 초과 ${bytes}B > ${LIMITS.MAX_STATE_BYTES}B (S-5.6)` };
    }

    // safeWriteAtomic 이 ~/.sodam/ 디렉터리를 먼저 만듭니다.
    // 🔴 2026-08-02 실측상 이 폴더는 존재하지 않으므로 이 단계가 없으면 첫 발행이 실패합니다.
    const path = safeWriteAtomic(SHARED_STATE, body);
    return { ok: true, path, bytes };
  } catch (err) {
    // S-13.4: 스택 트레이스 대신 한 줄
    return { ok: false, reason: err?.message ?? '발행 실패' };
  }
}

/** 6형제가 읽는 쪽 헬퍼 (읽기 전용 — 형제들이 복사해 쓸 수 있게 공개) */
export const SHARED_STATE_PATH = SHARED_STATE;
export const SHARED_ROOT = SHARED_DIR;

/** CLI: node lib/publish.mjs */
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const graph = loadGraphOrExit(); // M15
  const { snapshot } = scanAll(graph);
  const res = publish(graph, snapshot);
  if (res.ok) {
    console.log(`발행 완료: ${res.path} (${res.bytes}B / 상한 ${LIMITS.MAX_STATE_BYTES}B)`);
    console.log(`필드: ${WHITELIST.join(' · ')}  ← 커밋 제목 없음 (S-4.5)`);
  } else {
    console.log(`발행 실패(본체는 정상): ${res.reason}`);
  }
  // 발행 실패가 종료 코드를 오염시키지 않게 (S-6.5)
  process.exit(0);
}

export const _internal = { WHITELIST };
