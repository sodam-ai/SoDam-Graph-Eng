#!/usr/bin/env node
/**
 * session-start.mjs — 세션 시작 자동 주입 (SessionStart 훅)
 *
 * 규격: 07_FAMILY_COEXIST.md §4 규약 E
 *   E1 출력 3줄 이내         E2 패밀리 합계 10줄
 *   E3 끄는 법 필수           E4 형제 저장소 밖이면 아무것도 출력 안 함
 *   E5 1초 이내 (초과 시 캐시만 읽고 백그라운드 재스캔)
 *   E6 실패해도 세션 시작을 절대 막지 않음
 *
 * 🔴 출력 형식 (2026-08-02 실측 확인 — 이 PC 에서 동작 중인 훅과 동일)
 *   침묵 : {"continue":true,"suppressOutput":true}
 *   안내 : {"continue":true,"hookSpecificOutput":{"hookEventName":"SessionStart",
 *                                                 "additionalContext":"..."}}
 *   **평문을 그냥 찍으면 무시됩니다.** 반드시 stdout 에 JSON 을 씁니다.
 */

import { spawn } from 'node:child_process';
import { resolve as resolvePath, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUDGET_MS = 1000; // E5
const STALE_MIN = 10; // 06 §3-B D2
const started = Date.now();

/** 침묵 (E3·E4·E5·E6 공통 출구) */
function silent() {
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
  process.exit(0);
}

/** 안내 — 3줄 이내만 허용 (E1) */
function notice(lines) {
  const text = lines.filter(Boolean).slice(0, 3).join('\n'); // E1 하드 상한
  process.stdout.write(
    JSON.stringify({
      continue: true,
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text },
    })
  );
  process.exit(0);
}

/** 경로를 짧게 — 마지막 두 조각만 (07 §4 출력 예시 형식) */
function shortPath(p) {
  if (!p) return '';
  const parts = String(p).split(/[\\/]/).filter(Boolean);
  return parts.length <= 2 ? p : `...${sep}${parts.slice(-2).join(sep)}`;
}

/** 예산을 넘겼는가 (E5) */
const overBudget = () => Date.now() - started > BUDGET_MS;

/** 오래된 스냅샷을 백그라운드에서 갱신 — 세션을 절대 붙잡지 않는다 (E5) */
function rescanDetached() {
  try {
    const child = spawn(process.execPath, [resolvePath(HERE, '..', 'lib', 'scan.mjs')], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch {
    /* 실패해도 무시 — 부가 동작 */
  }
}

// E6: 어떤 예외도 세션 시작을 막지 않는다
try {
  // E3 — 사용자가 껐으면 즉시 침묵
  if (process.env.SODAM_GRAPH_SILENT === '1') silent();

  const { loadGraph } = await import('../lib/loadGraph.mjs');
  const { readSnapshot, isStale, judgeProject } = await import('../lib/judge.mjs');

  const graph = loadGraph();

  // 캐시 우선 — 스캔은 캐시가 아예 없을 때만 (E5)
  let snapshot = readSnapshot();
  let stale = false;

  if (!snapshot) {
    if (overBudget()) silent();
    const { scanAll } = await import('../lib/scan.mjs');
    snapshot = scanAll(graph).snapshot;
  } else if (isStale(snapshot, new Date(), STALE_MIN)) {
    stale = true; // 낡은 값으로 즉시 답하고, 갱신은 백그라운드로
  }

  if (overBudget()) silent();

  // E4 — 지금 열린 폴더가 형제 저장소 안인가. 아니면 아무 말도 하지 않는다.
  const cwd = resolvePath(process.cwd());
  const here = snapshot.projects.find((p) => {
    if (!p.repo_root) return false;
    const root = resolvePath(p.repo_root);
    return cwd === root || cwd.startsWith(root.endsWith(sep) ? root : root + sep);
  });
  if (!here) {
    if (stale) rescanDetached();
    silent();
  }

  const p = graph.projects.find((x) => x.id === here.project_id);
  const j = judgeProject(graph, snapshot, here.project_id);
  const stamp = String(snapshot.scanned_at).slice(11, 16);

  // 정체 형제 수 (활동 축이 아니라 정체 축 — 12차)
  const stalled = snapshot.projects.filter(
    (x) => x.days_in_state !== null && x.days_in_state >= graph.config.stall_days
  ).length;

  // 자기 저장소에서 열면 이름이 두 번 나오므로 접두사만 남긴다
  const head =
    p.id === 'sodam-graph-eng' ? '[소담그래프엔지니어링]' : `[소담그래프엔지니어링] ${p.name_ko} ·`;
  const line1 = `${head} ${shortPath(here.repo_root)}`;

  // j.text 가 이미 "시작: …" 처럼 동사로 시작하므로 "다음:" 을 덧붙이지 않는다
  const stateLabel = j.kind === 'coarse' ? '거친 판정' : (here.state ?? '-');
  const days = here.days_in_state !== null ? ` (${here.days_in_state}일)` : '';
  const line2 = `  현재: ${stateLabel}${days} → ${j.text}`;
  const line3 =
    `  7형제 중 정체 ${stalled}곳 · /graph-next 로 전체 보기` +
    `   [${stamp} 기준${stale ? ' · 갱신 중' : ''}]`;

  if (stale) rescanDetached();
  notice([line1, line2, line3]);
} catch {
  // E6: 조용히 침묵. 스택 트레이스도 내보내지 않는다 (08 S-13.4)
  silent();
}
