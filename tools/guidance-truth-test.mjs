/**
 * guidance-truth-test.mjs — 안내 문구가 코드의 실제 동작과 같은지 확인
 *
 * 배경(2026-11-26): 여러 곳이 "/graph-shadow 로 정리하면 자동 판정된다 / 거친 판정에서 벗어난다"고
 * 안내했지만, 기록은 "다음 할 일" 문구만 채우고 추적 상태·순위·정체 일수·어긋남 경고는 그대로다.
 * 또 /graph-why 는 막힌 항목을 무조건 "사람 몫"이라 했다 — 다른 형제를 기다리는 경우에도.
 *
 * 안전: lib·data 를 임시 폴더에 복사해 합성값으로만 실행합니다. 형제 폴더는 읽지 않습니다.
 * 실행: node tools/guidance-truth-test.mjs   (성공 0 / 실패 1)
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOOP = 'sodam-loop-eng';
const GRAPH = 'sodam-graph-eng';
const M16 = 'sodam-graph-eng.M16';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
}
const read = (...p) => readFileSync(join(REPO, ...p), 'utf8');
const linesOf = (text) => text.split(/\r?\n/);

// ── 1. 지킬 수 없는 약속이 남아 있지 않다 ──
const PROMISE = /자동\s?판정\s?(됩니다|된다)|자동으로 판정합니다|거친 판정에서 벗어납|정상 판정으로 바뀝|한 번 정리하면 사라진/;
const hits = [];
for (const [dir, ext] of [['commands', '.md'], ['lib', '.mjs'], ['hooks', '.mjs']]) {
  for (const f of readdirSync(join(REPO, dir)).filter((n) => n.endsWith(ext))) {
    linesOf(read(dir, f)).forEach((l, i) => {
      if (PROMISE.test(l)) hits.push(`${dir}/${f}:${i + 1}`);
    });
  }
}
check('P1 명령 안내와 코드 문구에 지킬 수 없는 약속이 없다', hits.length === 0, hits.join(', '));

const featureHits = [];
for (const f of ['README.md', 'README.en.md', 'README.html', 'README.en.html']) {
  linesOf(read(f)).forEach((l, i) => {
    // 기능 설명 목록 줄만 본다 — "실제 출력" 예시(과거 기록)와 업데이트 요약의 인용은 제외
    if (/^(- |<li>)/.test(l) && /그다음부터 자동 판정|judged automatically from then on/.test(l)) featureHits.push(`${f}:${i + 1}`);
  });
}
check('P2 README 기능 설명에도 없다', featureHits.length === 0, featureHits.join(', '));

const nextDoc = read('commands', 'graph-next.md');
const shadowDoc = read('commands', 'graph-shadow.md');
check('P3 graph-next 안내가 "기록해도 그대로인 것"을 말한다', linesOf(nextDoc).filter((l) => l.includes('/graph-shadow') && l.includes('그대로')).length >= 2);
check('P4 graph-shadow 안내가 바뀌는 것과 그대로인 것을 말한다', shadowDoc.includes('다음 할 일') && shadowDoc.includes('그대로'));
check('P5 graph-shadow 안내가 "업데이트 때 기록이 따라오지 않을 수 있음"을 알린다', /업데이트[^\n]*따라오지 않을 수/.test(shadowDoc));

const shadowSrc = read('lib', 'shadow.mjs');
check(
  'P6 뜰 수 없는 "낡음" 경고를 안내하지 않는다 (낡음 감지는 판정에 연결돼 있지 않음)',
  !shadowDoc.includes('형제 쪽 기록이 그 뒤에 바뀌었습니다') && shadowDoc.includes('자동으로 알려주지 않')
);
check(
  'P7 "형제 기록을 읽게 되면 그쪽이 우선"이라고 약속하지 않는다 (안내문·기록 파일 꼬리말)',
  !/그쪽이 우선/.test(shadowDoc) && !shadowSrc.split(/\r?\n/).some((l) => l.includes('`>') && l.includes('그쪽이 우선'))
);
check('P8 위치를 못 찾은 형제는 기록해도 안 보인다고 알린다', /위치를 못 찾[^.]*보이지 않/.test(shadowDoc));
check(
  'P9 graph-next 의 🟡 설명이 모든 급하지 않은 알림에 맞는다',
  linesOf(nextDoc).some((l) => l.startsWith('| 🟡 |') && l.includes('급하지 않은 알림'))
);

// ── 2. 새 안내가 사실인지 — 실제 코드로 확인 ──
const work = mkdtempSync(join(tmpdir(), 'sodam-graph-truth-'));
try {
  const home = join(work, 'home');
  const plugin = join(work, 'plugin');
  mkdirSync(home, { recursive: true });
  for (const d of ['lib', 'data']) {
    cpSync(join(REPO, d), join(plugin, d), {
      recursive: true,
      filter: (src) => !/[\\/]data[\\/](snapshot\.json|\.lock|shadow)$/.test(src),
    });
  }
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.SODAM_GRAPH_SEARCH_ROOTS;
  delete env.SODAM_GRAPH_DEBUG;
  delete env.NODE_OPTIONS;
  delete env.NODE_V8_COVERAGE;
  env.SODAM_GRAPH_ROOT = join(work, 'repos');

  const graphPath = join(plugin, 'data', 'graph.json');
  const original = readFileSync(graphPath, 'utf8');
  const base = JSON.parse(original);
  const nameOf = (id) => base.projects.find((p) => p.id === id).name_ko;
  const pad = (n) => String(n).padStart(2, '0');
  const makeSnapshot = (days) => {
    const n = new Date();
    return {
      scanned_at:
        `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}` +
        `T${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`,
      projects: base.projects.map((p) => {
        const open = base.milestones
          .filter((m) => m.project_id === p.id && m.state !== 'done')
          .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0];
        return {
          project_id: p.id, name_ko: p.name_ko, repo_root: join(work, 'repos', p.id), resolve_status: 'found_by_remote',
          state: open?.state ?? null, milestone_id: open?.id ?? null, days_in_state: days[p.id] ?? 1, days_since_activity: 0,
          git_last_commit_date: null, git_dirty_count: 0, tracking_files: ['CHECKPOINT.md'], coarse: null, mismatch: [],
        };
      }),
    };
  };

  const lib = (f) => import(pathToFileURL(join(plugin, 'lib', f)).href);
  const { loadGraph } = await lib('loadGraph.mjs');
  const { judgeProject, collectMismatches } = await lib('judge.mjs');
  const { computeCriticalPath } = await lib('critical.mjs');
  const { buildMermaid } = await lib('mermaid.mjs');
  const { writeShadow } = await lib('shadow.mjs');

  const snap = makeSnapshot({ [LOOP]: 97 });
  const measure = () => {
    const g = loadGraph();
    return {
      kind: judgeProject(g, snap, LOOP).kind,
      score: computeCriticalPath(g, snap).ranked.find((r) => r.project_id === LOOP).score,
      node: buildMermaid(g, snap).mermaid.split('\n').find((l) => l.includes(`${LOOP}[`)),
      warn: collectMismatches(g, snap).filter((w) => w.code === 'resolvable_coarse' || /거친 판정/.test(w.text)).length,
    };
  };
  const before = measure();
  writeShadow(LOOP, { last: '이전 일', next: '새 할 일' });
  const after = measure();
  check('F1 기록하면 /graph-next 의 판정 종류는 바뀐다 (coarse → shadow, 기호 🟡 → ▶)', before.kind === 'coarse' && after.kind === 'shadow', `${before.kind} → ${after.kind}`);
  check('F2 점수·지도 (추정)·어긋남 경고는 그대로다', after.score === before.score && after.node === before.node && after.node.includes('(추정)') && after.warn === before.warn && after.warn > 0, JSON.stringify({ before, after }));

  const aged = structuredClone(snap);
  aged.projects.find((s) => s.project_id === LOOP).coarse = { checkpoint_mtime: '2999-01-01', open_items: [], open_checkboxes: 0 };
  const agedJudge = judgeProject(loadGraph(), aged, LOOP);
  check(
    'F3 형제 기록이 더 새것이어도 낡음 경고는 뜨지 않는다 (안내문이 그렇게 말해야 하는 이유)',
    agedJudge.kind === 'shadow' && !String(agedJudge.detail).includes('바뀌었습니다'),
    `${agedJudge.kind} / ${agedJudge.detail}`
  );

  // ── 3. /graph-why 의 "걸린 것" ──
  const stuck = (mutate) => {
    const g = JSON.parse(original);
    mutate(g);
    writeFileSync(graphPath, JSON.stringify(g, null, 2));
    writeFileSync(join(plugin, 'data', 'snapshot.json'), JSON.stringify(makeSnapshot({ [GRAPH]: 900 })));
    const r = spawnSync(process.execPath, [join(plugin, 'lib', 'critical.mjs')], { cwd: home, env, encoding: 'utf8', timeout: 120_000 });
    if (r.status !== 0) throw new Error(`critical.mjs exit=${r.status} ${r.stderr}`);
    const out = linesOf(r.stdout);
    return { head: out.find((l) => l.startsWith('[지금 딱 하나만')) ?? '', line: out.find((l) => l.trim().startsWith('걸린 것:')) ?? '' };
  };

  const waiting = stuck(() => {});
  check('K0 전제: 막힌 M16 이 1위다', waiting.head.includes(nameOf(GRAPH)), waiting.head);
  check('K1 사람 블로커가 없고 다른 형제를 기다리면 "사람 몫"이라 하지 않는다', !waiting.line.includes('사람 몫'), waiting.line);
  check('K2 대신 기다리는 형제 이름을 말한다', waiting.line.includes('다른 형제 진행 대기') && waiting.line.includes(nameOf(LOOP)), waiting.line);

  const human = stuck((g) => {
    g.blockers.push({ id: 'blk-901', milestone_id: M16, kind: 'legal', description: '시험', since: '2026-01-01' });
  });
  check('K3 사람 블로커가 기록돼 있으면 "사람 몫"이라 말한다 (숨기지 않음)', human.line.includes('사람 몫'), human.line);

  const internal = stuck((g) => {
    const m16 = g.milestones.find((m) => m.id === M16);
    g.milestones.push({ ...m16, id: `${GRAPH}.T9`, seq: 999, title: '시험 앞 단계', state: 'todo' });
    for (const e of g.edges) if (e.from === M16 && e.type === 'depends_on') e.to = `${GRAPH}.T9`;
  });
  check(
    'K5 같은 프로젝트의 앞 단계를 기다리면 "이유 없음"이라 하지 않는다',
    internal.head.includes(nameOf(GRAPH)) && internal.line.includes('앞 단계 대기') && internal.line.includes('시험 앞 단계') && !internal.line.includes('사람 몫'),
    internal.line
  );

  const unknown = stuck((g) => {
    g.edges = g.edges.filter((e) => !(e.from === M16 && e.type === 'depends_on'));
  });
  check('K4 둘 다 없으면 "이유가 기록돼 있지 않다"고 한다', unknown.line.includes('기록돼 있지 않') && !unknown.line.includes('사람 몫'), unknown.line);
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
