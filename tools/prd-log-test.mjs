/**
 * prd-log-test.mjs — 형제의 진행 기록이 .PRD 안에 있어도 읽는지, 문장은 새지 않는지 확인
 *
 * 배경(2026-11-27): 코드는 저장소 맨 위의 CHECKPOINT.md 만 봤는데 형제들은 .PRD/ 안에 두고 있었다.
 *   파일이 없으면 조용히 0 이 되므로, 미완료 개수·가짜 완료 검사가 알림 없이 멈춰 있었다.
 *
 * 지키는 것: 맨 위 파일이 우선(기존 동작 그대로) · .PRD 에서 읽으면 개수·날짜만(문장 인용 없음) ·
 *            .PRD 가 바로 가기(정션)면 읽지 않음
 *
 * 안전: 임시 폴더의 가짜 저장소만 씁니다. 실제 형제 폴더·지도·홈에 쓰지 않습니다.
 * 실행: node tools/prd-log-test.mjs   (성공 0 / 실패 1)
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');
const canonicalBefore = md5(join(REPO, 'data', 'graph.json'));
const SECRET_LINE = 'PRIVATE-SENTENCE-DO-NOT-QUOTE';
const LOG = `# 기록\n- [ ] ${SECRET_LINE} 첫 번째\n- [ ] 두 번째 남은 일\n✅ 끝난 일\n`;

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
}

for (const k of Object.keys(process.env)) if (/^GIT_/i.test(k)) delete process.env[k];

const work = mkdtempSync(join(tmpdir(), 'sodam-graph-prdlog-'));
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
  const lib = (f) => import(pathToFileURL(join(plugin, 'lib', f)).href);
  const { extractLayer1 } = await lib('scan.mjs');

  const make = (name, files) => {
    const root = join(work, 'unit', name);
    mkdirSync(root, { recursive: true });
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), body, 'utf8');
    }
    return root;
  };

  // ── A. .PRD 안에만 있는 경우 ──
  const a = extractLayer1(make('only-prd', { '.PRD/CHECKPOINT.md': LOG }));
  check('A1 .PRD 의 기록을 읽어 줄 수·미완료 수·수정일이 나온다', a.checkpoint_lines > 0 && a.open_checkboxes === 2 && Boolean(a.checkpoint_mtime), JSON.stringify(a));
  check('A2 .PRD 에서 읽은 결과에는 문장이 하나도 없다', !JSON.stringify(a).includes(SECRET_LINE) && a.open_items.length === 0, JSON.stringify(a));
  check('A3 인용을 뺐다는 표시가 있다', a.quote_withheld === true, JSON.stringify(a));

  // ── B. 맨 위 파일이 있으면 예전과 같다 ──
  const b = extractLayer1(make('both', { 'CHECKPOINT.md': '- [ ] 맨 위의 남은 일\n', '.PRD/CHECKPOINT.md': LOG }));
  check('B1 맨 위 파일이 우선이고 예전처럼 인용한다', b.open_checkboxes === 1 && b.open_items[0] === '맨 위의 남은 일' && b.quote_withheld !== true, JSON.stringify(b));

  // ── C. .PRD 가 저장소 밖을 가리키는 바로 가기 ──
  const outside = make('outside', { 'CHECKPOINT.md': LOG });
  const linked = make('linked', { 'README.md': 'x\n' });
  symlinkSync(outside, join(linked, '.PRD'), 'junction');
  const c = extractLayer1(linked);
  check('C1 바로 가기인 .PRD 는 읽지 않는다', c.checkpoint_lines === 0 && c.open_checkboxes === 0 && c.checkpoint_mtime === null, JSON.stringify(c));

  // ── D. 둘 다 없으면 예전과 같다 ──
  const d = extractLayer1(make('none', { 'README.md': 'x\n' }));
  check('D1 기록이 없으면 0 이고 오류가 없다', d.checkpoint_lines === 0 && d.open_checkboxes === 0 && d.checkpoint_mtime === null, JSON.stringify(d));

  // ── E. 전체 흐름: 가짜 형제 저장소 → 탐색 → 판정 화면 ──
  const graph = JSON.parse(readFileSync(join(plugin, 'data', 'graph.json'), 'utf8'));
  const isolated = { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, '.config'), GIT_CONFIG_NOSYSTEM: '1' };
  for (const p of graph.projects) {
    const dir = join(repos, `t_SoDam-${p.id}-Eng`);
    mkdirSync(join(dir, '.PRD'), { recursive: true });
    writeFileSync(join(dir, '.PRD', 'CHECKPOINT.md'), LOG, 'utf8');
    execFileSync('git', ['-C', dir, 'init', '-q'], { env: { ...process.env, ...isolated } });
    execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', `https://github.com/${p.repo_remote}.git`], { env: { ...process.env, ...isolated } });
  }
  const env = { ...process.env, ...isolated, SODAM_GRAPH_ROOT: repos, CLAUDE_CONFIG_DIR: join(home, 'claude') };
  for (const k of ['SODAM_GRAPH_SEARCH_ROOTS', 'SODAM_GRAPH_DEBUG', 'NODE_OPTIONS', 'NODE_V8_COVERAGE', 'NODE_COMPILE_CACHE']) delete env[k];
  const run = (script) => {
    const r = spawnSync(process.execPath, [join(plugin, 'lib', script)], { cwd: home, env, encoding: 'utf8', timeout: 180_000 });
    if (r.status !== 0) throw new Error(`${script} exit=${r.status} ${r.stderr}`);
    return r.stdout;
  };
  run('refresh.mjs'); // 저장본과 공유 파일을 만든다 (judge.mjs 는 저장본을 쓰지 않는다)
  const screen = run('judge.mjs');
  const snapText = readFileSync(join(plugin, 'data', 'snapshot.json'), 'utf8');
  const snap = JSON.parse(snapText);
  check('E1 저장본의 진행 기록 위치가 .PRD/CHECKPOINT.md', snap.projects.every((p) => p.checkpoint_path === '.PRD/CHECKPOINT.md'), snap.projects.map((p) => p.checkpoint_path).join(','));
  check('E2 저장본에 문장이 없다', !snapText.includes(SECRET_LINE));
  check('E3 판정 화면에 문장이 없다', !screen.includes(SECRET_LINE));
  check('E4 판정 화면이 미완료 개수와 "인용 안 함"을 알린다', screen.includes('미완료 2건') && screen.includes('문장은 인용 안 함'), screen.slice(0, 500));
  check('E5 공유 파일에도 문장이 없다', !readFileSync(join(home, '.sodam', 'graph-state.json'), 'utf8').includes(SECRET_LINE));

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
