/**
 * resolve-partial-scan-test.mjs — 상한에 끊긴 전수 탐색이 1차 결과를 덮어쓰던 결함 회귀 테스트
 *
 * 배경(2026-11-26 실측): 형제 하나의 git worktree 가 생겨 원격이 같은 폴더가 2개가 되자
 * ① 그 형제가 lost → ② 필터 없는 전수 탐색 → ③ 디렉터리 상한(S-5.2)에서 끊김
 * → ④ 그 불완전한 결과가 1차에서 정상으로 찾은 형제까지 덮어써 7곳 전부 lost.
 *
 * 지켜야 하는 규칙 (02 §resolve 절차):
 *   · 부분 결과로는 확인된 값을 지우지 않는다
 *   · 후보가 둘 이상이면 lost — 잘못 찾는 것이 못 찾는 것보다 위험하다 (부분 탐색이 하나만 봤어도 고르지 않는다)
 *   · 전수 탐색이 끝까지 돌았으면 기존대로 그 결과를 쓴다
 *
 * 안전: 전부 임시 폴더에 만든 가짜 저장소만 씁니다. 실제 형제 폴더는 읽지 않습니다.
 * 실행: node tools/resolve-partial-scan-test.mjs   (성공 0 / 실패 1)
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { resolveAll } from '../lib/resolve.mjs';
import { LIMITS } from '../lib/loadGraph.mjs';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
}

const work = mkdtempSync(join(tmpdir(), 'sodam-graph-resolve-'));
const url = (n) => `https://github.com/test-owner/${n}.git`;

/** root 아래 folder 에 원격이 name 인 가짜 저장소를 만든다 */
function repo(root, folder, name) {
  const dir = join(root, folder);
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', url(name)]);
  return dir;
}

/**
 * 시나리오 하나를 실행한다.
 * 탐색은 이름 역순으로 내려가므로, 접두사로 "전수 탐색이 상한 전에 보는 것"을 정한다:
 *   z* → 상한 전에 봄 · y-noise(상한 소진용) · 그 앞 이름 → 상한 때문에 못 봄
 */
function run(label, repos, { noise = true } = {}) {
  const root = join(work, label);
  mkdirSync(root, { recursive: true });
  for (const [folder, name] of repos) repo(root, folder, name);
  if (noise) {
    for (let i = 0; i < LIMITS.MAX_DIRS + 20; i += 1) {
      mkdirSync(join(root, 'y-noise', `n${String(i).padStart(4, '0')}`), { recursive: true });
    }
  }
  const projects = ['a', 'b', 'c', 'd'].map((k) => ({
    id: `sodam-test${k}-eng`,
    repo_remote: `test-owner/${k}`,
    markers: [],
  }));
  const { results, stats } = resolveAll({
    config: { search_roots: [root], scan_filter: '*SoDam-*-Eng*' },
    projects,
  });
  const by = Object.fromEntries(results.map((r) => [r.id.slice('sodam-test'.length, -'-eng'.length), r]));
  const show = (k) =>
    `${by[k].resolve_status}:${by[k].repo_root ? basename(by[k].repo_root) : '-'}:${by[k].ambiguous?.length ?? 0}`;
  return { by, stats, show };
}
const foundAt = (r, folder) => Boolean(r.repo_root) && basename(r.repo_root) === folder;

try {
  // T1 — 실제로 터진 상황: c 만 중복, 전수 탐색은 상한에서 끊김
  const t1 = run('t1', [
    ['b-SoDam-A-Eng', 'a'],
    ['b-SoDam-B-Eng', 'b'],
    ['b-SoDam-C-Eng', 'c'],
    ['b-SoDam-C-Eng_wt', 'c'],
    ['b-SoDam-D-Eng', 'd'],
  ]);
  check('T1a 전제: 전수 탐색이 상한에서 끊겼다', t1.stats.capped === true, JSON.stringify(t1.stats));
  check(
    'T1b 1차에서 찾은 3곳은 그대로다',
    foundAt(t1.by.a, 'b-SoDam-A-Eng') && foundAt(t1.by.b, 'b-SoDam-B-Eng') && foundAt(t1.by.d, 'b-SoDam-D-Eng'),
    `a=${t1.show('a')} b=${t1.show('b')} d=${t1.show('d')}`
  );
  check('T1c 중복인 곳은 lost + 후보 2개', !t1.by.c.repo_root && t1.by.c.ambiguous?.length === 2, t1.show('c'));

  // T2 — 부분 탐색이 중복 중 하나만 봐도 고르지 않는다
  const t2 = run('t2', [
    ['b-SoDam-A-Eng', 'a'],
    ['b-SoDam-B-Eng', 'b'],
    ['z-SoDam-C-Eng', 'c'],
    ['b-SoDam-C-Eng', 'c'],
    ['b-SoDam-D-Eng', 'd'],
  ]);
  check('T2 부분 탐색이 하나만 봐도 중복은 lost 로 남는다', !t2.by.c.repo_root && t2.by.c.ambiguous?.length === 2, t2.show('c'));

  // T3 — 부분 탐색에서 "다른 위치의 같은 원격"을 실제로 봤다면 안전 쪽(lost)
  const t3 = run('t3', [
    ['b-SoDam-A-Eng', 'a'],
    ['z-other-copy-of-a', 'a'],
    ['b-SoDam-B-Eng', 'b'],
    ['b-SoDam-D-Eng', 'd'],
  ]);
  check('T3 부분 탐색이 다른 복사본을 봤으면 그 형제는 고르지 않는다', !t3.by.a.repo_root && t3.by.a.ambiguous?.length === 2, t3.show('a'));

  // T4 — 부분 탐색은 못 찾았던 곳을 여전히 채워 준다
  const t4 = run('t4', [
    ['b-SoDam-A-Eng', 'a'],
    ['b-SoDam-B-Eng', 'b'],
    ['z-renamed-c', 'c'],
    ['b-SoDam-D-Eng', 'd'],
  ]);
  check('T4 필터 밖 형제는 부분 탐색이 채운다', foundAt(t4.by.c, 'z-renamed-c') && foundAt(t4.by.a, 'b-SoDam-A-Eng'), `c=${t4.show('c')} a=${t4.show('a')}`);

  // T5 — 전수 탐색이 끝까지 돌면 기존 동작 그대로 (필터 밖 복사본 → 중복)
  const t5 = run(
    't5',
    [
      ['b-SoDam-A-Eng', 'a'],
      ['a-copy-of-a', 'a'],
      ['b-SoDam-B-Eng', 'b'],
      ['b-SoDam-D-Eng', 'd'],
    ],
    { noise: false }
  );
  check('T5a 전제: 전수 탐색이 끝까지 돌았다', t5.stats.capped === false && t5.stats.fullScan === true, JSON.stringify(t5.stats));
  check('T5b 완전한 탐색의 판정은 그대로 (a 는 중복 → lost)', !t5.by.a.repo_root && t5.by.a.ambiguous?.length === 2, t5.show('a'));
} finally {
  // 이 테스트가 방금 만든 임시 폴더만 정리 (실패해도 결과에 영향 없음)
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {
    console.log(`   (참고) 임시 폴더 정리 실패 — 직접 지워도 됩니다: ${work}`);
  }
}

console.log(failed === 0 ? '\n=== 종합: PASS ===' : `\n=== 종합: FAIL (${failed}건) ===`);
process.exit(failed === 0 ? 0 : 1);
