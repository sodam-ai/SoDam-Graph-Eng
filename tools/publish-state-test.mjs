/**
 * publish-state-test.mjs — 형제가 읽는 공유 파일의 state 가 지금의 지도와 같은지 확인
 *
 * 배경(2026-11-27 재현): /graph-next 는 임시 저장본(snapshot)을 먼저 만든 뒤 완료 확정·승격을 하는데,
 * 발행은 그 저장본의 옛 state 를 그대로 실었다 → 지도는 done, 공유 파일은 done_candidate.
 * 거부·되돌리기 뒤에도 10분 이내 저장본을 쓰면 같은 일이 생긴다.
 *
 * 지키는 것: 공유 6필드 그대로 · 못 찾은 형제의 state 는 비움 · 위치·스캔 시각은 저장본 그대로 ·
 *            발행 시점은 늘리지 않음(거부·되돌리기 자체는 발행하지 않음)
 *
 * 안전: 코드를 임시 폴더에 복사하고 가짜 저장소로 실행합니다. 실제 지도·형제 폴더·홈에 쓰지 않습니다.
 * 실행: node tools/publish-state-test.mjs   (성공 0 / 실패 1)
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = 'sodam-harness-eng';
const GONE = 'sodam-reverse-eng'; // 폴더를 안 만들어 "못 찾은 형제"로 씀
const FIELDS = 'id,name_ko,repo_root,resolve_status,scanned_at,state';
const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');
const canonicalBefore = md5(join(REPO, 'data', 'graph.json'));

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
}

for (const k of Object.keys(process.env)) if (/^GIT_/i.test(k)) delete process.env[k];

const work = mkdtempSync(join(tmpdir(), 'sodam-graph-pub-'));
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
  const original = readFileSync(graphPath, 'utf8');
  // XDG_CONFIG_HOME 도 임시 폴더로 — 물려받으면 git 이 실제 홈의 설정을 읽는다
  const isolated = { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, '.config'), GIT_CONFIG_NOSYSTEM: '1' };
  const gitEnv = { ...process.env, ...isolated };
  const repoDir = (id) => join(repos, `t_SoDam-${id}-Eng`);
  for (const p of JSON.parse(original).projects) {
    if (p.id === GONE) continue;
    mkdirSync(repoDir(p.id), { recursive: true });
    execFileSync('git', ['-C', repoDir(p.id), 'init', '-q'], { env: gitEnv });
    execFileSync('git', ['-C', repoDir(p.id), 'remote', 'add', 'origin', `https://github.com/${p.repo_remote}.git`], { env: gitEnv });
  }

  const env = { ...process.env, ...isolated, SODAM_GRAPH_ROOT: repos, CLAUDE_CONFIG_DIR: join(home, 'claude') };
  for (const k of ['SODAM_GRAPH_SEARCH_ROOTS', 'SODAM_GRAPH_DEBUG', 'NODE_OPTIONS', 'NODE_V8_COVERAGE']) delete env[k];
  const run = (script, ...args) => {
    const r = spawnSync(process.execPath, [join(plugin, 'lib', script), ...args], { cwd: home, env, encoding: 'utf8', timeout: 180_000 });
    if (r.status !== 0) throw new Error(`${script} exit=${r.status} ${r.stderr}`);
    return r.stdout;
  };

  const statePath = join(home, '.sodam', 'graph-state.json');
  const published = () => JSON.parse(readFileSync(statePath, 'utf8'));
  const row = (id = TARGET) => published().projects.find((p) => p.id === id);
  const cachedRow = () => JSON.parse(readFileSync(join(plugin, 'data', 'snapshot.json'), 'utf8')).projects.find((p) => p.project_id === TARGET);
  const readGraph = () => JSON.parse(readFileSync(graphPath, 'utf8'));

  // 대상 형제의 대표 단계(미완료 중 seq 최솟값)를 하나만 가진 상태로 시작
  const targetId = JSON.parse(original).milestones
    .filter((m) => m.project_id === TARGET && m.state !== 'done')
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0].id;
  const mileState = () => readGraph().milestones.find((m) => m.id === targetId).state;

  /** 시나리오 시작: 지도를 되돌리고 대상 단계만 원하는 상태로, 저장본·발행본·거부 이력은 지움 */
  const reset = (patch) => {
    const g = JSON.parse(original);
    Object.assign(g.milestones.find((m) => m.id === targetId), patch);
    writeFileSync(graphPath, `${JSON.stringify(g, null, 2)}\n`, 'utf8');
    for (const p of [join(plugin, 'data', 'snapshot.json'), join(plugin, 'data', 'rejected.json'), statePath]) {
      rmSync(p, { force: true }); // 이 테스트가 만든 임시 파일만
    }
  };

  // 확정·승격의 필수 증거(E1)는 done_when 에 적힌 파일이 저장소에 실제로 있는 것
  mkdirSync(join(repoDir(TARGET), 'docs'), { recursive: true });
  writeFileSync(join(repoDir(TARGET), 'docs', 'proof.md'), 'ok\n', 'utf8');

  // ── A. 확정: done_candidate → /graph-next 가 done 으로 확정 ──
  reset({ state: 'done_candidate', done_when: 'docs/proof.md 가 있다', evidence: '시험 전제' });
  run('refresh.mjs'); // 10분 이내 저장본을 만든다
  const out = run('judge.mjs');
  check('A0 전제: 이번 실행이 확정을 했다', out.includes('자동 확정됨') && mileState() === 'done', mileState());
  check('A1 확정 직후 공유 state 에 옛 done_candidate 가 남지 않는다', row().state === null, String(row().state));
  const scannedAt = cachedRow().scanned_at;
  check('A2 위치·스캔 시각은 저장본 값 그대로', row().scanned_at === scannedAt && row().repo_root === cachedRow().repo_root, `${row().scanned_at} / ${scannedAt}`);
  check('A3 공유 항목은 6필드 그대로', published().projects.every((p) => Object.keys(p).sort().join(',') === FIELDS));
  check('A4 못 찾은 형제의 state 는 비어 있다', row(GONE).state === null && row(GONE).repo_root === null, JSON.stringify(row(GONE)));

  // ── B. 승격: verified + 증거 → /graph-next 가 done_candidate 로 제안 ──
  reset({ state: 'verified', done_when: 'docs/proof.md 가 있다', evidence: '시험 전제', last_moved_at: '2026-01-01' });
  run('refresh.mjs');
  run('judge.mjs');
  check('B0 전제: 이번 실행이 승격 제안을 했다', mileState() === 'done_candidate', mileState());
  check('B1 승격 직후 공유 state 가 done_candidate', row().state === 'done_candidate', String(row().state));

  // ── C. 거부 → 10분 이내 /graph-why ──
  reset({ state: 'done_candidate' });
  run('refresh.mjs');
  const beforeReject = readFileSync(statePath, 'utf8');
  run('judge.mjs', '--reject', targetId);
  check('C0 전제: 거부로 지도가 verified, 저장본은 옛 값', mileState() === 'verified' && cachedRow().state === 'done_candidate', `${mileState()} / ${cachedRow().state}`);
  check('C1 거부 명령 자체는 발행하지 않는다 (발행 시점 불변)', readFileSync(statePath, 'utf8') === beforeReject);
  run('critical.mjs');
  check('C2 다음 /graph-why 발행은 verified', row().state === 'verified', String(row().state));

  // ── D. 되돌리기 → 10분 이내 /graph-why ──
  reset({ state: 'done' });
  run('refresh.mjs');
  run('judge.mjs', '--undo', targetId);
  check('D0 전제: 되돌려 지도가 verified, 저장본은 대표 단계 없음', mileState() === 'verified' && cachedRow().state === null, `${mileState()} / ${cachedRow().state}`);
  run('critical.mjs');
  check('D1 다음 /graph-why 발행은 verified', row().state === 'verified', String(row().state));

  // ── E. 블로커 기록은 state 를 바꾸지 않는다 ──
  reset({});
  run('refresh.mjs');
  const stateBefore = row().state;
  const blockOut = run('judge.mjs', '--block', targetId, '--kind', 'decision', '--description', '시험용 막힘');
  run('critical.mjs');
  check('E1 블로커 기록 뒤에도 state 는 지도와 같다', blockOut.includes('기록 완료') && row().state === stateBefore && row().state === mileState(), `${blockOut.trim()} / ${row().state}`);
  check('E2 블로커 내용은 공유 파일에 실리지 않는다', !readFileSync(statePath, 'utf8').includes('시험용 막힘'));

  // ── F. 지도를 읽은 뒤, 훑는 동안 다른 세션이 상태를 바꾼 경우 ──
  /** 옛 지도를 먼저 읽고 → 파일을 바꾼 다음 → 그 옛 지도를 들고 발행하는 임시 실행기 */
  const staleRun = (call, newState) => {
    const lib = (f) => JSON.stringify(pathToFileURL(join(plugin, 'lib', f)).href);
    const runner = join(work, 'stale.mjs');
    writeFileSync(
      runner,
      [
        "import { readFileSync, writeFileSync } from 'node:fs';",
        `const { loadGraph } = await import(${lib('loadGraph.mjs')});`,
        `const { scanAll } = await import(${lib('scan.mjs')});`,
        `const { publishSnapshot, scanAndPublish } = await import(${lib('refresh.mjs')});`,
        'const old = loadGraph();',
        `const p = ${JSON.stringify(graphPath)};`,
        newState === null
          ? "writeFileSync(p, '{ 깨진 지도', 'utf8');"
          : `const g = JSON.parse(readFileSync(p, 'utf8')); g.milestones.find((m) => m.id === ${JSON.stringify(targetId)}).state = ${JSON.stringify(newState)}; writeFileSync(p, JSON.stringify(g), 'utf8');`,
        call,
        'console.log(JSON.stringify(res));',
      ].join('\n'),
      'utf8'
    );
    const r = spawnSync(process.execPath, [runner], { cwd: home, env, encoding: 'utf8', timeout: 180_000 });
    if (r.status !== 0) throw new Error(`stale 실행기 exit=${r.status} ${r.stderr}`);
    return JSON.parse(r.stdout.trim().split(/\r?\n/).pop());
  };

  reset({ state: 'done_candidate' });
  staleRun('const res = scanAndPublish(old);', 'verified');
  check('F1 백그라운드 재탐색: 훑는 동안 바뀐 상태가 발행에 반영', row().state === 'verified', String(row().state));

  reset({ state: 'done_candidate' });
  staleRun('const res = publishSnapshot(old, scanAll(old).snapshot);', 'verified');
  check('F2 판정 명령 경로: 발행 직전의 지도를 쓴다', row().state === 'verified', String(row().state));

  // 직전 발행본(verified)이 있는 상태에서, 옛 지도(done_candidate)를 든 실행이 최신 지도를 못 읽는 경우
  reset({ state: 'verified' });
  run('refresh.mjs');
  const previous = readFileSync(statePath, 'utf8');
  const stale = JSON.parse(original);
  stale.milestones.find((m) => m.id === targetId).state = 'done_candidate';
  writeFileSync(graphPath, `${JSON.stringify(stale, null, 2)}\n`, 'utf8');
  const broken = staleRun('const snap = scanAll(old).snapshot; const res = publishSnapshot(old, snap);', null);
  check(
    'F3 발행 직전 지도를 못 읽으면 멈추지 않고 발행을 건너뛰며 직전 파일을 둔다',
    broken.ok === false && typeof broken.reason === 'string' && readFileSync(statePath, 'utf8') === previous,
    `${JSON.stringify(broken)} / ${row().state}`
  );

  check('Z 실제 저장소의 data/graph.json 은 그대로', md5(join(REPO, 'data', 'graph.json')) === canonicalBefore);
  if (!existsSync(statePath)) check('Z2 발행 파일이 임시 홈에 생겼다', false);
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
