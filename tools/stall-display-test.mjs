/**
 * stall-display-test.mjs — 정체 일수 표시 회귀 테스트 (배너 · /graph-why · /graph-map)
 *
 * 배경(2026-11-26 실측): 정체 일수는 graph.json 의 last_moved_at 부터 세는데,
 * 거친 판정(coarse)에는 그 날짜를 바꾸는 승격 경로가 없다. 오늘 커밋한 형제도
 * "97일 정지"로만 보여, 추적해서 잰 값처럼 읽혔다.
 *
 * 이 테스트가 지키는 것:
 *   · coarse 는 "단계 추적 안 됨"이라고 말한다 (shadow 기록이 있어도 — 추적 상태는 안 바뀜)
 *   · 정체 일수 옆에 활동 축(마지막 활동)을 함께 보여 준다. 값이 없으면 지어내지 않는다
 *   · 순위 점수는 그대로다 (02 §활동 축·정체 축, 06 — 순위에는 정체 축만)
 *   · 배너는 3줄 이내 (07 §4 규약 E1)
 *
 * 안전: 저장소 원본·형제 저장소에는 아무것도 쓰지도 읽지도 않는다.
 *   코드와 data 를 임시 폴더에 복사하고, 스캔 결과(snapshot.json)는 여기서 만든 합성값을 쓴다.
 *   발행 파일(~/.sodam)도 임시 홈으로 돌린다.
 *
 * 실행: node tools/stall-display-test.mjs   (성공 0 / 실패 1)
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOOP = 'sodam-loop-eng'; // coarse + shadow 기록 있음
const PROMPT = 'sodam-prompt-eng'; // coarse + 활동 값 없음
const GRAPH = 'sodam-graph-eng'; // 추적되는 상태(blocked)

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
}

const work = mkdtempSync(join(tmpdir(), 'sodam-graph-stall-'));
const home = join(work, 'home');
const plugin = join(work, 'plugin');
mkdirSync(home, { recursive: true });
for (const d of ['hooks', 'lib', '.claude-plugin', 'data']) {
  cpSync(join(REPO, d), join(plugin, d), {
    recursive: true,
    filter: (src) => !/[\\/]data[\\/](snapshot\.json|\.lock)$/.test(src),
  });
}

// ── 합성 shadow 기록 — 저장소의 실제 기록 유무에 기대지 않는다 (B3 전제) ──
mkdirSync(join(plugin, 'data', 'shadow'), { recursive: true });
writeFileSync(
  join(plugin, 'data', 'shadow', `${LOOP}.md`),
  `---\nproject_id: ${LOOP}\nsource: user_input\nrecorded_at: 2026-01-01\n---\n\n` +
    '## 시험용 다음 할 일\n- state: todo\n- done_when: 시험\n- owner: human\n- evidence: 시험\n'
);

// ── 합성 스캔 결과 ──
const DAYS = { [LOOP]: [97, 0], [PROMPT]: [122, null], [GRAPH]: [116, 3] };
const graph = JSON.parse(readFileSync(join(plugin, 'data', 'graph.json'), 'utf8'));
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const scannedAt =
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
  `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

const projects = graph.projects.map((p) => {
  const open = graph.milestones
    .filter((m) => m.project_id === p.id && m.state !== 'done')
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0];
  const [stall, activity] = DAYS[p.id] ?? [86, 10];
  const root = join(work, 'repos', p.id);
  mkdirSync(root, { recursive: true });
  return {
    project_id: p.id,
    name_ko: p.name_ko,
    repo_root: root,
    resolve_status: 'found_by_remote',
    state: open?.state ?? null,
    milestone_id: open?.id ?? null,
    days_in_state: stall,
    days_since_activity: activity,
    git_last_commit_date: null,
    git_last_commit_subject: null,
    git_dirty_count: 0,
    tracking_files: [],
    coarse: null,
    mismatch: [],
  };
});
const snapshot = { scanned_at: scannedAt, projects };
writeFileSync(join(plugin, 'data', 'snapshot.json'), JSON.stringify(snapshot));

const env = { ...process.env, HOME: home, USERPROFILE: home };
delete env.SODAM_GRAPH_SILENT;
delete env.SODAM_GRAPH_ROOT;
delete env.SODAM_GRAPH_SEARCH_ROOTS;
delete env.SODAM_GRAPH_DEBUG;

const run = (script, cwd) =>
  spawnSync(process.execPath, [join(plugin, ...script.split('/'))], {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 120_000,
  });

/** 그 형제 폴더에서 훅을 실행해 배너 줄들을 돌려준다 */
function banner(projectId) {
  const r = run('hooks/session-start.mjs', join(work, 'repos', projectId));
  try {
    return JSON.parse(r.stdout).hookSpecificOutput.additionalContext.split('\n');
  } catch {
    return [`(배너 없음 exit=${r.status} out=${r.stdout} err=${r.stderr})`];
  }
}

try {
  // ── 배너 ──
  const loop = banner(LOOP);
  check('B1 coarse 배너: "단계 추적 안 됨" + 기록 일수', loop[1]?.includes('단계 추적 안 됨') && loop[1]?.includes('97일'), loop[1]);
  check('B2 coarse 배너: "마지막 활동 오늘"', loop[1]?.includes('마지막 활동 오늘'), loop[1]);
  check(
    'B3 shadow 가 있어도 영문 coarse 라벨이 새지 않는다',
    loop[1]?.includes('시험용 다음 할 일') && !loop[1]?.includes('coarse'),
    loop[1]
  );
  check('B4 배너 3줄 이내 (E1)', loop.length <= 3, `${loop.length}줄`);
  check('B5 3번째 줄: 정체 7곳 중 6곳은 추적 안 됨', loop[2]?.includes('정체 7곳 (6곳은 단계 추적 안 됨)'), loop[2]);

  const own = banner(GRAPH);
  check('B6 추적되는 상태는 그대로: blocked (116일)', own[1]?.includes('blocked (116일)') && !own[1]?.includes('단계 추적 안 됨'), own[1]);
  check('B7 추적되는 상태에도 활동 축 병기: 3일 전', own[1]?.includes('마지막 활동 3일 전'), own[1]);

  const noAct = banner(PROMPT);
  check('B8 활동 값이 없으면 지어내지 않는다', noAct[1]?.includes('단계 추적 안 됨') && !noAct[1]?.includes('마지막 활동'), noAct[1]);

  // ── /graph-why ──
  const why = run('lib/critical.mjs', home).stdout;
  check('W1 1순위 이유에 "단계 추적 안 됨" + "마지막 활동 오늘"', /이유:\r?\n[^\n]*단계 추적 안 됨[^\n]*마지막 활동 오늘/.test(why), why.slice(0, 300));
  check('W2 coarse 를 "N일 정지"로 단정하지 않는다', !why.includes('97일 정지'), why.slice(0, 300));
  check('W3 점수는 그대로 (97 × 2 × 0.7 = 135.8)', why.includes('점수 97 × (1+1) × 0.7 = 135.8'), why.slice(0, 400));

  // ── /graph-map ──
  const lib = (f) => import(pathToFileURL(join(plugin, 'lib', f)).href);
  const { buildMermaid } = await lib('mermaid.mjs');
  const { loadGraph } = await lib('loadGraph.mjs');
  const { mermaid } = buildMermaid(loadGraph(), snapshot);
  const node = (id) => mermaid.split('\n').find((l) => l.trim().startsWith(`${id}[`)) ?? '';
  check('M1 관계도 라벨에 활동 축 병기', node(LOOP).includes('97일') && node(LOOP).includes('활동 오늘'), node(LOOP));
  check('M2 coarse 라벨 끝 "(추정)" 유지 (M5 규격)', /\(추정\)"\]/.test(node(LOOP)), node(LOOP));
  check('M3 활동 값이 없으면 라벨에 안 붙인다', !node(PROMPT).includes('활동'), node(PROMPT));

  const map = run('lib/mermaid.mjs', home).stdout;
  check('M4 범례가 "/graph-shadow 하면 (추정)이 사라진다"고 약속하지 않는다', map.includes('보는 법') && !map.includes('사라집니다'), map.slice(-500));
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
