/**
 * unresolved-sibling-test.mjs — 위치를 못 찾은 형제를 숨기지 않는지 확인
 *
 * 배경(2026-11-26 실측): 못 찾은 형제는 정체 일수가 null → /graph-why 에서 0일·0점이 되고,
 * 경고 없이 다른 곳이 "딱 하나"로 지목됐다. 세션 안내는 "7형제 중 정체 6곳"이라고만 해서
 * 나머지 1곳이 정상인 것처럼 읽혔다. 02 §resolve 절차: 못 찾은 것을 찾은 척하지 않는다.
 *
 * 지켜야 하는 것: 못 찾은 곳은 말한다 · 순위에 올리지 않는다 · 점수식은 그대로 ·
 *                 못 찾은 곳이 없으면 화면은 예전과 같다 · 안내는 3줄 이내(07 E1)
 *
 * 안전: lib·hooks·data 를 임시 폴더에 복사해 합성 스캔값으로만 실행합니다. 형제 폴더는 읽지 않습니다.
 * 실행: node tools/unresolved-sibling-test.mjs   (성공 0 / 실패 1)
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AGENTIC = 'sodam-agentic-eng';
const LOOP = 'sodam-loop-eng';
const GRAPH = 'sodam-graph-eng';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
}

const work = mkdtempSync(join(tmpdir(), 'sodam-graph-unresolved-'));
try {
  const home = join(work, 'home');
  const plugin = join(work, 'plugin');
  mkdirSync(home, { recursive: true });
  for (const d of ['hooks', 'lib', '.claude-plugin', 'data']) {
    cpSync(join(REPO, d), join(plugin, d), {
      recursive: true,
      filter: (src) => !/[\\/]data[\\/](snapshot\.json|\.lock|shadow)$/.test(src),
    });
  }
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.SODAM_GRAPH_SILENT;
  delete env.SODAM_GRAPH_SEARCH_ROOTS;
  delete env.SODAM_GRAPH_DEBUG;
  delete env.NODE_OPTIONS; // 상속하면 임시 홈 밖을 건드리는 사전 로드·커버리지 쓰기가 가능하다
  delete env.NODE_V8_COVERAGE;
  env.SODAM_GRAPH_ROOT = join(work, 'repos'); // 다시 스캔해도 실제 형제 폴더는 안 읽는다 (S-13.7)

  const graph = JSON.parse(readFileSync(join(plugin, 'data', 'graph.json'), 'utf8'));
  const nameOf = (id) => graph.projects.find((p) => p.id === id).name_ko;
  const pad = (n) => String(n).padStart(2, '0');

  /** lost 목록과 정체 일수를 정해 합성 스냅샷을 쓴다 */
  function setSnapshot(lost, days = { [LOOP]: 97, [GRAPH]: 116 }) {
    const n = new Date();
    const scanned_at =
      `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}` +
      `T${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
    const projects = graph.projects.map((p) => {
      const open = graph.milestones
        .filter((m) => m.project_id === p.id && m.state !== 'done')
        .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0];
      const gone = lost.includes(p.id);
      const root = join(work, 'repos', p.id);
      mkdirSync(root, { recursive: true });
      return {
        project_id: p.id,
        name_ko: p.name_ko,
        repo_root: gone ? null : root,
        resolve_status: gone ? 'lost' : 'found_by_remote',
        state: gone ? null : (open?.state ?? null),
        milestone_id: gone ? null : (open?.id ?? null),
        days_in_state: gone ? null : (days[p.id] ?? 86),
        days_since_activity: gone ? null : 0,
        git_last_commit_date: null,
        git_dirty_count: 0,
        tracking_files: [],
        coarse: null,
        mismatch: [],
      };
    });
    writeFileSync(join(plugin, 'data', 'snapshot.json'), JSON.stringify({ scanned_at, projects }));
  }
  const run = (script, cwd) => {
    const r = spawnSync(process.execPath, [join(plugin, ...script.split('/'))], { cwd, env, encoding: 'utf8', timeout: 120_000 });
    if (r.status !== 0) throw new Error(`${script} 비정상 종료 exit=${r.status} ${r.stderr}`);
    return r.stdout;
  };
  const why = () => run('lib/critical.mjs', home);
  const banner = (id) => JSON.parse(run('hooks/session-start.mjs', join(work, 'repos', id))).hookSpecificOutput.additionalContext.split('\n');
  const all = graph.projects.map((p) => p.id);

  // ── 한 곳을 못 찾음 ──
  setSnapshot([AGENTIC]);
  const one = why();
  const warn = one.split(/\r?\n/).find((l) => l.includes('위치를 못 찾')) ?? '';
  check('W1 /graph-why 가 못 찾은 곳의 수와 이름을 말한다', warn.includes('1곳') && warn.includes(nameOf(AGENTIC)), warn || one.slice(0, 200));
  check('W2 그 경고가 지목보다 먼저 나온다', one.indexOf('위치를 못 찾') >= 0 && one.indexOf('위치를 못 찾') < one.indexOf('[지금 딱 하나만'), one.slice(0, 200));
  check('W3 1위와 점수는 그대로 (97 × 2 × 0.7 = 135.8)', one.includes(nameOf(LOOP)) && one.includes('점수 97 × (1+1) × 0.7 = 135.8'), one.slice(0, 300));
  const b1 = banner(LOOP);
  check('B1 세션 안내가 "1곳은 위치 못 찾음"을 말한다', b1[2]?.includes('1곳은 위치 못 찾음'), b1[2]);
  check('B2 안내는 3줄 이내 (E1)', b1.length <= 3, `${b1.length}줄`);
  check('B3 정체 수 표시는 그대로 (6곳)', b1[2]?.includes('정체 6곳'), b1[2]);

  // ── 지목할 수 있는 곳이 못 찾은 곳 때문에 하나만 남음 → 2위 자리에 못 찾은 곳이 오지 않는다 ──
  setSnapshot(all.filter((id) => id !== LOOP));
  const only = why();
  check('W4 못 찾은 곳은 2위로도 올리지 않는다', only.includes('[지금 딱 하나만') && !/2위/.test(only), only.slice(0, 400));
  check('W5 못 찾은 수를 정확히 센다 (6곳)', /6곳/.test(only.split(/\r?\n/).find((l) => l.includes('위치를 못 찾')) ?? ''), only.slice(0, 200));

  // ── 전부 못 찾음 ──
  setSnapshot(all);
  const none = why();
  check('W6 전부 못 찾으면 아무 곳도 지목하지 않는다', !none.includes('[지금 딱 하나만') && none.includes('지금 지목할 것이 없습니다'), none.slice(0, 200));
  check('W7 그 이유를 "위치를 못 찾음"으로 말한다 ("전부 완료"라고 하지 않는다)', none.includes('위치를 못 찾') && !none.includes('전부 완료'), none.slice(0, 200));

  // ── 순위에서 이미 빠지는 상태(전부 완료 · 순환)여도, 못 찾았다는 사실은 말한다 ──
  const graphPath = join(plugin, 'data', 'graph.json');
  const original = readFileSync(graphPath, 'utf8');
  const withGraph = (mutate) => {
    const g = JSON.parse(original);
    mutate(g);
    writeFileSync(graphPath, JSON.stringify(g, null, 2));
  };
  const warnOf = (out) => out.split(/\r?\n/).find((l) => l.includes('위치를 못 찾')) ?? '';

  withGraph((g) => {
    for (const m of g.milestones) if (m.project_id === AGENTIC) m.state = 'done';
  });
  setSnapshot([AGENTIC]);
  const doneLost = why();
  check('W8 모든 단계가 끝난 형제도 못 찾으면 이름을 말한다', warnOf(doneLost).includes(nameOf(AGENTIC)), doneLost.slice(0, 200));

  withGraph((g) => {
    const a = `${AGENTIC}.current`;
    const b = 'sodam-prompt-eng.current';
    g.edges.push({ from: a, to: b, type: 'depends_on', note: '시험' }, { from: b, to: a, type: 'depends_on', note: '시험' });
  });
  setSnapshot([AGENTIC]);
  const cycleLost = why();
  check('W9 전제: 순환이 감지된다', cycleLost.includes('순환 의존 발견'), cycleLost.slice(0, 200));
  check('W10 순환에 속한 형제도 못 찾으면 이름을 말한다', warnOf(cycleLost).includes(nameOf(AGENTIC)), cycleLost.slice(0, 300));
  writeFileSync(graphPath, original);

  // ── 못 찾은 곳 없음 → 예전과 같음 ──
  setSnapshot([]);
  const clean = why();
  check('N1 다 찾으면 /graph-why 에 새 문구가 없다', !clean.includes('위치를 못 찾') && clean.includes('[지금 딱 하나만'), clean.slice(0, 200));
  const b2 = banner(LOOP);
  check('N2 다 찾으면 안내에도 새 문구가 없다', !b2[2]?.includes('위치 못 찾음') && b2[2]?.includes('정체 7곳'), b2[2]);

  // ── 명령 안내문 ──
  const doc = readFileSync(join(REPO, 'commands', 'graph-why.md'), 'utf8');
  check(
    'D1 graph-why 안내가 못 찾음 경고를 먼저 전하게 한다',
    doc.split(/\r?\n/).some((l) => l.includes('위치를 못 찾') && l.includes('지목 결과보다 먼저'))
  );
  check('D2 2위 배율을 "순위에 든 곳 안에서"로 한정한다', /순위에 든 곳 안에서/.test(doc));
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
