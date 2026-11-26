/**
 * session-start-nosnap-test.mjs — 세션 훅 E5 회귀 테스트 (캐시 없는 새 설치 상태)
 *
 * 배경(2026-11-26 실측): 스냅샷(data/snapshot.json)이 없으면 훅이 스캔을 그 자리에서
 * 돌리고 저장도 안 해서, 세션을 열 때마다(형제 밖 폴더에서도) 스캔이 반복됐다.
 * 07_FAMILY_COEXIST.md 규약 E5 는 "초과 시 캐시만 읽고 백그라운드 재스캔" 이다.
 *
 * 이 테스트가 확인하는 것 (시간 측정은 PC 부하에 흔들리므로 단언하지 않고 참고로만 출력):
 *   A0. 준비한 복사본에 스냅샷이 없다 (전제 조건)
 *   A1. 스냅샷이 없을 때 첫 실행: 정상 종료 + 침묵 출력
 *   A2. 백그라운드 재스캔이 스냅샷을 만들어 준다   ← 결함이 있으면 영원히 안 생겨 FAIL
 *   A3. 두 번째 실행(형제 밖 폴더): 정상 종료 + 침묵 출력 (E4)
 *
 * 안전: 저장소 원본에는 아무것도 쓰지 않는다.
 *   - 훅·lib·data 를 임시 폴더로 복사해서 그 복사본만 실행한다.
 *   - 발행 파일(~/.sodam)도 임시 홈으로 돌려 실제 발행본을 건드리지 않는다.
 *   - 형제 저장소는 읽기만 한다 (scan 의 읽기 전용 불변식 그대로).
 *
 * 실행: node tools/session-start-nosnap-test.mjs   (성공 0 / 실패 1)
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WAIT_MS = 60_000; // 백그라운드 재스캔 대기 상한 (PC 가 느려도 넉넉히)
const SILENT = JSON.stringify({ continue: true, suppressOutput: true });

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed += 1;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 조건이 참이 될 때까지 기다린다 (최대 WAIT_MS) */
async function waitFor(cond) {
  const until = Date.now() + WAIT_MS;
  while (Date.now() < until) {
    if (cond()) return true;
    await sleep(300);
  }
  return cond();
}

// ── 준비: 임시 복사본 (스냅샷 제외) ──
const work = mkdtempSync(join(tmpdir(), 'sodam-graph-nosnap-'));
const home = join(work, 'home'); // 발행 파일(~/.sodam)을 여기로 돌린다
const plugin = join(work, 'plugin');
mkdirSync(home, { recursive: true });
for (const d of ['hooks', 'lib', '.claude-plugin', 'data']) {
  cpSync(join(REPO, d), join(plugin, d), {
    recursive: true,
    filter: (src) => !/[\\/]data[\\/](snapshot\.json|\.lock)$/.test(src),
  });
}
const snapshotPath = join(plugin, 'data', 'snapshot.json');
const publishedPath = join(home, '.sodam', 'graph-state.json');
const env = { ...process.env, HOME: home, USERPROFILE: home };
delete env.SODAM_GRAPH_SILENT;
delete env.SODAM_GRAPH_ROOT;
delete env.SODAM_GRAPH_SEARCH_ROOTS;

/** 훅을 형제 저장소가 아닌 폴더(임시 홈)에서 실행 */
function runHook() {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [join(plugin, 'hooks', 'session-start.mjs')], {
    cwd: home,
    env,
    encoding: 'utf8',
    timeout: 120_000,
  });
  return { ...r, ms: Date.now() - t0 };
}

try {
  check('A0 전제: 복사본에 스냅샷이 없다', !existsSync(snapshotPath));

  const first = runHook();
  console.log(`   (참고) 첫 실행 ${first.ms}ms`);
  check('A1 첫 실행: 정상 종료 + 침묵 출력', first.status === 0 && first.stdout.trim() === SILENT, `exit=${first.status} out=${first.stdout.trim().slice(0, 60)}`);

  const made = await waitFor(() => existsSync(snapshotPath) && existsSync(publishedPath));
  check('A2 백그라운드 재스캔이 스냅샷·발행본을 만들었다', made, made ? '' : `${WAIT_MS / 1000}초 안에 생기지 않음 — 매 세션 스캔 결함`);

  const second = runHook();
  console.log(`   (참고) 두 번째 실행 ${second.ms}ms`);
  check('A3 두 번째 실행(형제 밖 폴더): 정상 종료 + 침묵 출력', second.status === 0 && second.stdout.trim() === SILENT, `exit=${second.status}`);
} finally {
  // 임시 폴더 정리 (이 테스트가 방금 만든 폴더만 — 실패해도 결과에 영향 없음)
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {
    console.log(`   (참고) 임시 폴더 정리 실패 — 직접 지워도 됩니다: ${work}`);
  }
}

console.log(failed === 0 ? '\n=== 종합: PASS ===' : `\n=== 종합: FAIL (${failed}건) ===`);
process.exit(failed === 0 ? 0 : 1);
