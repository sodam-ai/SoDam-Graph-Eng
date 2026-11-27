/**
 * false-done-test.mjs — 끝나지 않은 일이 저절로 done 이 되지 않는지 확인
 *
 * 배경(2026-11-27): 확정 단계는 상태와 거부 이력만 봤다. 제안 뒤에 막힘을 적거나 증거가 사라져도
 *   다음 실행에서 done 이 됐고, 되돌린 항목은 다시 제안된 뒤 그다음 실행에서 다시 done 이 됐다.
 *
 * 지키는 것: 확정 직전에 블로커·"사람 확인"·저장소 위치·실물 증거를 다시 본다 · 보류는 이유와 함께 알린다 ·
 *            되돌린 항목은 자동으로 다시 제안하지 않는다 · 조건이 그대로면 예전처럼 확정된다
 *
 * 안전: 코드를 임시 폴더에 복사하고 가짜 저장소로 실행합니다. 실제 지도·형제 폴더·홈에 쓰지 않습니다.
 * 실행: node tools/false-done-test.mjs   (성공 0 / 실패 1)
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = 'sodam-harness-eng';
const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');
const canonicalBefore = md5(join(REPO, 'data', 'graph.json'));

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
}

for (const k of Object.keys(process.env)) if (/^GIT_/i.test(k)) delete process.env[k];

const work = mkdtempSync(join(tmpdir(), 'sodam-graph-done-'));
try {
  const home = join(work, 'home');
  const plugin = join(work, 'plugin');
  const repos = join(work, 'repos');
  mkdirSync(home, { recursive: true });
  for (const d of ['lib', 'data']) {
    cpSync(join(REPO, d), join(plugin, d), {
      recursive: true,
      filter: (src) => !/[\\/]data[\\/](snapshot\.json|rejected\.json|\.lock|shadow)$/.test(src),
    });
  }
  const graphPath = join(plugin, 'data', 'graph.json');
  const rejectedPath = join(plugin, 'data', 'rejected.json');
  const original = readFileSync(graphPath, 'utf8');
  const isolated = { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, '.config'), GIT_CONFIG_NOSYSTEM: '1' };
  const repoDir = (id) => join(repos, `t_SoDam-${id}-Eng`);
  for (const p of JSON.parse(original).projects) {
    mkdirSync(repoDir(p.id), { recursive: true });
    execFileSync('git', ['-C', repoDir(p.id), 'init', '-q'], { env: { ...process.env, ...isolated } });
    execFileSync('git', ['-C', repoDir(p.id), 'remote', 'add', 'origin', `https://github.com/${p.repo_remote}.git`], { env: { ...process.env, ...isolated } });
  }
  const proof = join(repoDir(TARGET), 'docs', 'proof.md');
  mkdirSync(dirname(proof), { recursive: true });
  const env = { ...process.env, ...isolated, SODAM_GRAPH_ROOT: repos, CLAUDE_CONFIG_DIR: join(home, 'claude') };
  for (const k of ['SODAM_GRAPH_SEARCH_ROOTS', 'SODAM_GRAPH_DEBUG', 'NODE_OPTIONS', 'NODE_V8_COVERAGE', 'NODE_COMPILE_CACHE']) delete env[k];
  const run = (...args) => {
    const r = spawnSync(process.execPath, [join(plugin, 'lib', 'judge.mjs'), ...args], { cwd: home, env, encoding: 'utf8', timeout: 180_000 });
    if (r.status !== 0) throw new Error(`judge exit=${r.status} ${r.stderr}`);
    return r.stdout;
  };

  const targetId = JSON.parse(original).milestones
    .filter((m) => m.project_id === TARGET && m.state !== 'done')
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0].id;
  const state = () => JSON.parse(readFileSync(graphPath, 'utf8')).milestones.find((m) => m.id === targetId).state;
  const rejected = () => (existsSync(rejectedPath) ? JSON.parse(readFileSync(rejectedPath, 'utf8')).entries.map((e) => e.milestone_id) : []);
  const reset = (patch) => {
    const g = JSON.parse(original);
    Object.assign(
      g.milestones.find((m) => m.id === targetId),
      { done_when: 'docs/proof.md 가 있다', evidence: '시험 전제', last_moved_at: '2026-01-01' },
      patch
    );
    writeFileSync(graphPath, `${JSON.stringify(g, null, 2)}\n`, 'utf8');
    for (const p of [join(plugin, 'data', 'snapshot.json'), rejectedPath]) rmSync(p, { force: true });
    writeFileSync(proof, 'ok\n', 'utf8');
  };
  const held = (out) => out.includes('확정 보류') && out.includes(targetId) && !out.includes('자동 확정됨');

  // ── A. 조건이 그대로면 예전처럼 확정 ──
  reset({ state: 'done_candidate' });
  const a = run();
  check('A1 증거가 있고 막힘이 없으면 done 으로 확정', state() === 'done' && a.includes('자동 확정됨'), state());

  // ── B. 제안 뒤에 막힘을 기록 ──
  reset({ state: 'done_candidate' });
  run('--block', targetId, '--kind', 'decision', '--description', '시험용 막힘');
  const b = run();
  check('B1 막힘이 있으면 확정하지 않고 이유를 알린다', state() === 'done_candidate' && held(b) && b.includes('블로커'), `${state()} / ${b.slice(0, 300)}`);
  check('B2 보류 안내가 "이유가 사라지면 바로 done"과 거부가 영구임을 알린다', b.includes('바로 done 이 됩니다') && b.includes('자동 제안이 다시 켜지지 않습니다'), b.slice(0, 500));
  const blockerId = JSON.parse(readFileSync(graphPath, 'utf8')).blockers.find((x) => x.milestone_id === targetId).id;
  run('--resolve-block', blockerId);
  run();
  check('B3 안내대로 블로커를 풀면 다음 판정에서 확정된다', state() === 'done', state());

  // ── H. 완료 제안 안내 ──
  reset({ state: 'verified' });
  const h = run();
  check('H1 완료 제안 안내가 확정 전에 다시 확인한다고 알린다', state() === 'done_candidate' && h.includes('다시 확인해 통과하면 done'), `${state()} / ${h.slice(0, 500)}`);

  // ── C. "사람 확인" 문구 ──
  reset({ state: 'done_candidate', evidence: '사람 확인 필요' });
  const c = run();
  check('C1 "사람 확인" 문구가 있으면 확정하지 않는다', state() === 'done_candidate' && held(c) && c.includes('사람 확인'), `${state()} / ${c.slice(0, 300)}`);

  // ── D. 증거 파일이 사라짐 ──
  reset({ state: 'done_candidate' });
  rmSync(proof, { force: true }); // 이 테스트가 만든 임시 파일
  const d = run();
  check('D1 실물 증거가 사라지면 확정하지 않는다', state() === 'done_candidate' && held(d) && d.includes('증거'), `${state()} / ${d.slice(0, 300)}`);

  // ── E. 저장소를 못 찾음 ──
  reset({ state: 'done_candidate' });
  const away = join(work, 'away');
  renameSync(repoDir(TARGET), away);
  const e = run();
  renameSync(away, repoDir(TARGET));
  check('E1 저장소를 못 찾으면 확정하지 않는다', state() === 'done_candidate' && held(e) && e.includes('저장소'), `${state()} / ${e.slice(0, 300)}`);

  // ── F. 되돌린 항목 ──
  reset({ state: 'done' });
  const undoOut = run('--undo', targetId);
  check('F1 되돌리면 verified 이고 다시 제안하지 않도록 기록', state() === 'verified' && rejected().includes(targetId), `${state()} / ${rejected().join(',')}`);
  check('F2 되돌리기 안내가 "다시 제안되지 않습니다"를 알린다', undoOut.includes('다시 제안되지 않습니다'), undoOut);
  run();
  run();
  check('F3 판정을 두 번 더 돌려도 verified 로 남는다', state() === 'verified', state());

  // ── G. 되돌리기 실패 시에는 기록하지 않음 ──
  reset({ state: 'verified' });
  run('--undo', targetId);
  check('G1 done 이 아니어서 실패한 되돌리기는 거부 이력을 남기지 않는다', rejected().length === 0, rejected().join(','));

  check('Z 실제 저장소의 data/graph.json 은 그대로', md5(join(REPO, 'data', 'graph.json')) === canonicalBefore);
} catch (err) {
  check('실행 중 오류 없음', false, String(err.message).slice(0, 400));
} finally {
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {
    console.log(`   (참고) 임시 폴더 정리 실패 — 직접 지워도 됩니다: ${work}`);
  }
}

console.log(failed === 0 ? '\n=== 종합: PASS ===' : `\n=== 종합: FAIL (${failed}건) ===`);
process.exit(failed === 0 ? 0 : 1);
