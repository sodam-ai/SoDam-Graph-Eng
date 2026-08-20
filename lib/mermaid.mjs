/**
 * mermaid.mjs — 7형제 관계도 (Mermaid)
 *
 * 규격: 03_PHASES.md M5 §출력 규격 고정 (7차 보강)
 *   다이어그램 타입 : graph LR
 *   노드 ID        : Project.id            노드 라벨 : name_ko + state + 정지 일수
 *   depends_on/next: 실선 -->              conflicts : 점선 -.-> + 라벨 "충돌"
 *   shares         : 점선 -.-> + "공용"     coarse   : 라벨 끝에 추정 표기
 *   순환 발견 시    : :::cycle 클래스 + 그림 위 경고 한 줄
 *
 * 🔴 규격의 모호한 지점 하나를 이렇게 해석했습니다:
 *   노드 ID 가 **Project.id(형제 단위)** 인데 `next` 엣지는 **같은 형제 안의 마일스톤 순서**라,
 *   그대로 그리면 **자기 자신을 가리키는 화살표**가 생깁니다.
 *   → `from`·`to` 의 형제가 **다를 때만** 그리고, 생략한 개수를 그림 아래에 밝힙니다.
 *     (숨기는 게 아니라 "형제 안쪽 순서는 이 그림의 축척이 아니다"를 명시)
 */

import { pathToFileURL } from 'node:url';
import { loadGraph, loadGraphOrExit } from './loadGraph.mjs';
import { freshSnapshot } from './judge.mjs';

/** Mermaid 라벨에서 문법을 깨는 문자를 없앤다 */
export function escapeLabel(s) {
  return String(s ?? '')
    .replace(/["`]/g, '') // 따옴표는 라벨 구분자와 충돌
    .replace(/[[\]{}()]/g, '') // 대괄호·중괄호·소괄호는 노드 모양 문법
    .replace(/[|;]/g, ' ') // 엣지 라벨 구분자
    .replace(/\r?\n/g, ' ')
    .trim();
}

/** 마일스톤 id → 형제 id */
function projectOfMilestone(graph, milestoneId) {
  return graph.milestones.find((m) => m.id === milestoneId)?.project_id ?? null;
}

/**
 * depends_on 엣지에서 순환을 찾는다 (형제 단위).
 * M9 가 본격 판정을 하지만, 그림에도 경고가 필요해 여기에 최소 구현을 둡니다.
 * @returns {string[][]} 순환에 속한 형제 id 묶음
 */
export function findCycles(graph) {
  const adj = new Map();
  for (const e of graph.edges) {
    if (e.type !== 'depends_on') continue;
    const from = projectOfMilestone(graph, e.from);
    const to = projectOfMilestone(graph, e.to);
    if (!from || !to || from === to) continue;
    if (!adj.has(from)) adj.set(from, new Set());
    adj.get(from).add(to);
  }

  const cycles = [];
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map();
  const stack = [];

  const visit = (n) => {
    color.set(n, GRAY);
    stack.push(n);
    for (const nx of adj.get(n) ?? []) {
      const c = color.get(nx) ?? WHITE;
      if (c === GRAY) {
        const at = stack.indexOf(nx); // 역방향 간선 = 순환
        cycles.push(stack.slice(at === -1 ? 0 : at));
      } else if (c === WHITE) {
        visit(nx);
      }
    }
    stack.pop();
    color.set(n, BLACK);
  };

  for (const n of adj.keys()) if ((color.get(n) ?? WHITE) === WHITE) visit(n);
  return cycles;
}

/** 형제별 현재 상태 (대표 마일스톤 + 정체 축) */
function statusOf(graph, snapshot, projectId) {
  const snap = snapshot.projects.find((p) => p.project_id === projectId);
  const open = graph.milestones
    .filter((m) => m.project_id === projectId && m.state !== 'done')
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0];

  return {
    state: open?.state ?? 'done',
    days: snap?.days_in_state ?? null, // 정체 축 (12차에서 신설)
    lost: !snap?.repo_root,
    resolveStatus: snap?.resolve_status ?? 'lost',
  };
}

/**
 * 관계도를 만든다.
 * @returns {{mermaid: string, warnings: string[], skippedInternal: number}}
 */
export function buildMermaid(graph, snapshot) {
  const cycles = findCycles(graph);
  const inCycle = new Set(cycles.flat());
  const warnings = [];

  for (const c of cycles) {
    const names = c.map((id) => graph.projects.find((p) => p.id === id)?.name_ko ?? id);
    warnings.push(`순환 의존 발견: ${names.join(' → ')} → ${names[0]}`);
  }

  const lines = ['graph LR'];

  // ── 노드 ─────────────────────────────────────────────
  for (const p of graph.projects) {
    const st = statusOf(graph, snapshot, p.id);
    const bits = [st.state];
    if (st.days !== null) bits.push(`${st.days}일`);
    let label = `${escapeLabel(p.name_ko)}<br/>${bits.join(' · ')}`;
    // 규격(M5): coarse 노드는 라벨 끝에 `(추정)`.
    // 괄호는 `["..."]` 따옴표 안에서는 Mermaid 문법을 깨지 않으므로 규격 그대로 씁니다.
    if (st.state === 'coarse') label += ' (추정)';
    if (st.lost) label += '<br/>경로 유실';

    const cls = inCycle.has(p.id) ? ':::cycle' : st.lost ? ':::lost' : '';
    lines.push(`  ${p.id}["${label}"]${cls}`);
  }

  lines.push('');

  // ── 엣지 ─────────────────────────────────────────────
  let skippedInternal = 0;
  const seen = new Set();

  for (const e of graph.edges) {
    const from = projectOfMilestone(graph, e.from);
    const to = projectOfMilestone(graph, e.to);
    if (!from || !to) continue;

    // 같은 형제 안쪽 순서는 이 그림의 축척이 아니다 (파일 상단 주석 참조)
    if (from === to) {
      skippedInternal += 1;
      continue;
    }

    const key = `${from}|${to}|${e.type}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (e.type === 'depends_on' || e.type === 'next') {
      lines.push(`  ${from} --> ${to}`);
    } else if (e.type === 'conflicts') {
      lines.push(`  ${from} -.->|충돌| ${to}`);
    } else if (e.type === 'shares') {
      lines.push(`  ${from} -.->|공용| ${to}`);
    }
  }

  lines.push('');
  lines.push('  classDef cycle stroke:#d33,stroke-width:3px;');
  lines.push('  classDef lost stroke:#d33,stroke-dasharray:4 3;');

  return { mermaid: lines.join('\n'), warnings, skippedInternal };
}

/**
 * 문법 자체 검증 — 실제 렌더링은 사람이 눈으로 확인해야 합니다(GUI).
 * 여기서는 **깨질 만한 것**만 기계적으로 잡습니다.
 */
export function lintMermaid(text) {
  const problems = [];
  const lines = text.split('\n');

  if (!lines[0].startsWith('graph LR')) problems.push('첫 줄이 `graph LR` 이 아님');

  for (const [i, ln] of lines.entries()) {
    if (i === 0 || ln.trim() === '') continue;
    const t = ln.trim();
    if (t.startsWith('classDef')) continue;

    const node = t.match(/^([A-Za-z][\w-]*)\["([^"]*)"\](:::[\w-]+)?$/);
    if (node) continue;

    if (/^[A-Za-z][\w-]*\s+(-->|-\.->(\|[^|]*\|)?)\s+[A-Za-z][\w-]*$/.test(t)) continue;

    problems.push(`${i + 1}행: 알 수 없는 문법 — ${t}`);
  }

  const quotes = (text.match(/"/g) ?? []).length;
  if (quotes % 2 !== 0) problems.push('따옴표 개수가 홀수');

  return problems;
}

/** CLI: node lib/mermaid.mjs */
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const graph = loadGraphOrExit(); // M15
  const { snapshot, rescanned } = freshSnapshot(graph);
  const { mermaid, warnings, skippedInternal } = buildMermaid(graph, snapshot);
  const stamp = String(snapshot.scanned_at).slice(11, 16);

  console.log(`# 소담 7형제 관계도   [${stamp} 기준${rescanned ? ' · 방금 다시 훑음' : ''}]\n`);

  // 규격: 순환 발견 시 그림 **위에** 경고 한 줄
  for (const w of warnings) console.log(`> 🔴 ${w}\n`);

  console.log('```mermaid');
  console.log(mermaid);
  console.log('```');

  console.log('\n**보는 법**');
  console.log('- 실선 화살표 : 저게 먼저 끝나야 이걸 할 수 있음 (의존)');
  console.log('- 점선 : 같은 것을 함께 쓰거나(공용) 동시에 건드리면 부딪힘(충돌)');
  console.log('- 노드 안 숫자 : 그 단계에 머문 날수');
  console.log('- 추정 : 상세 단계를 아직 모르는 상태 — /graph-shadow 로 한 번만 정리하면 사라집니다');
  if (skippedInternal > 0) {
    console.log(
      `- 형제 **안쪽** 단계 순서 ${skippedInternal}개는 이 그림에 넣지 않았습니다 ` +
        '(이 그림은 형제 사이 관계만 봅니다 — 안쪽 순서는 /graph-next 로 보세요)'
    );
  }

  const problems = lintMermaid(mermaid);
  console.log(`\n문법 자체검사: ${problems.length === 0 ? '이상 없음' : `${problems.length}건`}`);
  for (const p of problems) console.log(`  · ${p}`);
  console.log('※ 실제로 그림이 잘 나오는지는 GitHub·VS Code 미리보기에서 **눈으로** 확인해 주세요.');
}
