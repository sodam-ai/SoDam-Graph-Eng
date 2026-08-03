/**
 * refresh.mjs — 스캔 + 발행을 한 묶음으로 배선한다 (M-W W-1)
 *
 * 규격: 02_DATA_MODEL.md §발행 배선 P-1~P-3
 *
 * 🔴 왜 별도 파일인가 (순환 import 방지):
 *   publish.mjs 는 scan.mjs 를 import 합니다. scan.mjs 가 다시 publish 를 부르면
 *   scan → publish → scan 순환이 됩니다 — M10 에서 shadow.mjs 가 이미 겪은 사고와
 *   같은 유형입니다. 이 파일이 "스캔 결과를 발행한다"는 순서만 담당하고,
 *   scan.mjs 와 publish.mjs 는 서로를 모르는 상태를 유지합니다.
 *
 * 호출 지점 (P-2 — publish.mjs 밖에서 ≥ 2곳):
 *   ① lib/judge.mjs CLI — 판정 명령(/graph-next) 실행 끝
 *   ② hooks/session-start.mjs 의 rescanDetached() — 세션 시작 백그라운드 재스캔 끝
 */

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadGraph } from './loadGraph.mjs';
import { scanAll, writeSnapshot } from './scan.mjs';
import { publish, SHARED_STATE_PATH } from './publish.mjs';

/**
 * 기존 발행본이 이번 스냅샷보다 최신인가 — 동시 세션 대비.
 * 백그라운드 재스캔(detached)은 끝나는 순서가 보장되지 않으므로, 늦게 끝난
 * 낡은 스캔이 최신 발행본을 덮어쓰지 못하게 막는다 (06 §3-B 가 graph.json 에
 * 두는 잠금과 같은 목적 — graph-state.json 은 파일 잠금 대신 이 시각 비교로 지킨다).
 */
function alreadyFresher(newScannedAt) {
  try {
    if (!existsSync(SHARED_STATE_PATH)) return false;
    const cur = JSON.parse(readFileSync(SHARED_STATE_PATH, 'utf8'));
    return typeof cur.scanned_at === 'string' && cur.scanned_at > newScannedAt;
  } catch {
    return false; // 읽기 실패 시 새로 쓰는 쪽이 안전 (F3·F4 와 동일 원칙 — 조용히 넘어가지 않고 새로 씀)
  }
}

/**
 * 이미 계산된 snapshot 을 발행만 한다 (이중 스캔 방지 — 판정 명령이 이미 스캔했으므로).
 * @returns {{ok:true,path:string,bytes:number}|{ok:false,reason:string}}
 */
export function publishSnapshot(graph, snapshot) {
  if (alreadyFresher(snapshot.scanned_at)) {
    return { ok: false, reason: '더 최신 발행본이 이미 있어 건너뜀 (동시 세션)' };
  }
  return publish(graph, snapshot); // S-6.5 — 실패해도 throw 하지 않음(publish.mjs 가 보장)
}

/** 스캔부터 새로 해서 발행한다 (세션 훅 백그라운드 재스캔 전용) */
export function scanAndPublish(graph = loadGraph()) {
  const { snapshot } = scanAll(graph);
  writeSnapshot(snapshot);
  return publishSnapshot(graph, snapshot);
}

/** CLI: node lib/refresh.mjs */
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const res = scanAndPublish();
  if (process.env.SODAM_GRAPH_DEBUG === '1') {
    console.log(res.ok ? `[발행] ${res.path} (${res.bytes}B)` : `[발행 생략] ${res.reason}`);
  }
  process.exit(0); // S-6.5 — 발행 실패가 종료 코드를 오염시키지 않게
}
