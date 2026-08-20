/**
 * critical.mjs — 임계 경로 판정 (M9 · /graph-why)
 *
 * 규격: 03_PHASES.md M9 · 06_ANTI_STALL_SPEC.md §3 규칙 C
 *
 * 🔴 실행 순서 고정 (문서가 못 박은 이유 그대로):
 *   1) 순환 탐지 먼저   2) 순환 노드는 점수 계산에서 제외 + 최우선 경고
 *   3) 남은 노드로 점수 계산 = 정지일수 × (1+막고있는 형제 수) × 신뢰도
 *   "막고 있는 형제 수"는 depends_on 역추적이라, 순환이 있으면 역추적이 안 끝난다.
 *
 * 🔧 순환 탐지는 새로 만들지 않습니다 — `mermaid.mjs` 의 findCycles() 를 그대로
 *    재사용합니다(M5 에서 이미 만들고 픽스처로 검증까지 끝난 함수, 중복 구현 금지).
 */

import { pathToFileURL } from 'node:url';
import { loadGraph, loadGraphOrExit } from './loadGraph.mjs';
import { freshSnapshot, judgeProject, daysSince } from './judge.mjs';
import { findCycles } from './mermaid.mjs';
import { publishSnapshot } from './refresh.mjs';

/** 형제의 대표(열린) 마일스톤 — judgeProject·collectMismatches·mermaid statusOf 와 동일 기준(seq 최솟값) */
function openMilestoneOf(graph, projectId) {
  return (
    graph.milestones
      .filter((m) => m.project_id === projectId && m.state !== 'done')
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0] ?? null
  );
}

/** 이 마일스톤을 `to` 로 하는 depends_on 엣지의 `from` 프로젝트 집합 (고유 형제 수만 센다) */
function blockingProjectsOf(graph, milestoneId) {
  const set = new Set();
  for (const e of graph.edges) {
    if (e.type !== 'depends_on' || e.to !== milestoneId) continue;
    const fromMilestone = graph.milestones.find((m) => m.id === e.from);
    if (fromMilestone) set.add(fromMilestone.project_id);
  }
  return set;
}

const nameKoOf = (graph, projectId) => graph.projects.find((p) => p.id === projectId)?.name_ko ?? projectId;

/**
 * 임계 경로 순위를 계산한다.
 * @returns {{ranked: Array<object>, cycles: string[][], excludedCount: number}}
 */
export function computeCriticalPath(graph, snapshot) {
  const cycles = findCycles(graph); // 1단계 — 순환 탐지 먼저
  const cycleProjects = new Set(cycles.flat()); // 2단계 — 제외 대상

  const rows = [];
  for (const p of graph.projects) {
    if (cycleProjects.has(p.id)) continue; // 순환에 속하면 점수 계산에서 제외
    const open = openMilestoneOf(graph, p.id);
    if (!open) continue; // 전부 done — 지목할 게 없음

    const snap = snapshot.projects.find((s) => s.project_id === p.id);
    const days = snap?.days_in_state ?? 0;
    const confidence = open.state === 'coarse' ? (graph.config.coarse_confidence ?? 0.7) : 1.0;
    const blockers = blockingProjectsOf(graph, open.id); // 3단계 — depends_on 역추적
    const score = days * (1 + blockers.size) * confidence;
    // 🔧 "다음 할 일" 문구는 judgeProject() 재사용 — coarse 인 경우 1.5층 원문 인용을
    //    포함한 문장을 이미 만들어주므로, 여기서 마일스톤 title(플레이스홀더일 수 있음)을
    //    그대로 쓰면 정보가 부실해진다. 중복 구현도 피한다.
    const judged = judgeProject(graph, snapshot, p.id);

    rows.push({
      project_id: p.id,
      name_ko: p.name_ko,
      milestone_id: open.id,
      title: open.title,
      nextAction: judged.text,
      nextDetail: judged.detail,
      state: open.state,
      days,
      blockingCount: blockers.size,
      blockingNames: [...blockers].map((id) => nameKoOf(graph, id)),
      confidence,
      score,
    });
  }

  rows.sort((a, b) => b.score - a.score);
  return { ranked: rows, cycles, excludedCount: cycleProjects.size };
}

/**
 * M13 — 사람 몫 블로커를 "며칠째 대기" 순(오래된 것 먼저)으로 정렬한다.
 * @returns {Array<{id, milestone_id, name_ko, title, kind, description, since, days}>}
 */
export function rankBlockers(graph, nowMs = Date.now()) {
  return graph.blockers
    .map((b) => {
      const m = graph.milestones.find((x) => x.id === b.milestone_id);
      const p = m ? graph.projects.find((x) => x.id === m.project_id) : null;
      return {
        id: b.id,
        milestone_id: b.milestone_id,
        name_ko: p?.name_ko ?? m?.project_id ?? '?',
        title: m?.title ?? b.milestone_id,
        kind: b.kind,
        description: b.description,
        since: b.since,
        days: daysSince(b.since, nowMs) ?? 0,
      };
    })
    .sort((a, b) => b.days - a.days);
}

/** CLI: node lib/critical.mjs */
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const graph = loadGraphOrExit(); // M15
  const { snapshot, rescanned } = freshSnapshot(graph);
  const stamp = String(snapshot.scanned_at).slice(11, 16);
  const rescannedTag = rescanned ? ' · 방금 다시 훑음' : '';

  // 🆕 W-1 배선 — 판정 직후 공유 발행 (02 §발행 배선 P-1: "판정 명령 실행 끝"이 호출 지점 ① — /graph-next 뿐 아니라 /graph-why 도 포함, judge.mjs 와 동일 배선)
  const pub = publishSnapshot(graph, snapshot);
  if (process.env.SODAM_GRAPH_DEBUG === '1') {
    console.log(pub.ok ? `[발행] ${pub.path} (${pub.bytes}B)` : `[발행 생략] ${pub.reason}`);
  }

  const { ranked, cycles, excludedCount } = computeCriticalPath(graph, snapshot);

  if (cycles.length > 0) {
    console.log('🔴 순환 의존 발견 — 서로가 서로를 기다려서 영원히 안 끝나는 상태입니다');
    for (const c of cycles) {
      console.log(`   ${c.map((id) => nameKoOf(graph, id)).join(' → ')} → (처음으로 되돌아옴)`);
    }
    console.log(`   순환에 속한 ${excludedCount}곳은 점수 계산에서 제외했습니다 — 하나를 떼어내야 풀립니다.\n`);
  }

  // M13 — 사람 몫 블로커 대시보드 (며칠째 대기 순). ranked 가 비어도(전부 완료·순환뿐이어도)
  // 블로커는 별개 엔티티라 조용히 숨기지 않는다.
  const blockerRanking = rankBlockers(graph);
  const printBlockers = () => {
    if (blockerRanking.length === 0) return;
    console.log(`\n사람 몫 블로커 ${blockerRanking.length}건 (오래 기다린 순):`);
    for (const b of blockerRanking) {
      console.log(`  · ${b.name_ko} · ${b.title} — ${b.days}일째 (${b.kind})`);
      console.log(`     └ ${b.description}   [${b.id}]`);
    }
  };

  if (ranked.length === 0) {
    console.log(`지금 지목할 것이 없습니다 — 전부 완료됐거나 순환에 걸려 있습니다.   [${stamp} 기준${rescannedTag}]`);
    printBlockers();
    process.exit(0);
  }

  const top = ranked[0];
  const confTag = top.confidence < 1 ? '   (상세 미상 — 추정치)' : '';
  console.log(`[지금 딱 하나만 푼다면]  ${top.name_ko} · ${top.title}   [${stamp} 기준${rescannedTag}]\n`);
  console.log('  이유:');
  console.log(`   · ${top.days}일 정지 (정체 축 기준)`);
  if (top.blockingCount > 0) {
    console.log(`   · 이 형제가 막고 있는 것: ${top.blockingNames.join(', ')}`);
  }
  console.log(
    `   · 점수 ${top.days} × (1+${top.blockingCount}) × ${top.confidence} = ${top.score.toFixed(1)}${confTag}`
  );
  if (ranked.length > 1) {
    const second = ranked[1];
    const ratio = second.score > 0 ? (top.score / second.score).toFixed(1) : '∞';
    console.log(
      `     2위 ${second.name_ko}  ${second.days} × (1+${second.blockingCount}) × ${second.confidence} = ${second.score.toFixed(1)}  보다 ${ratio}배`
    );
  }
  console.log(`\n  다음 할 일: ${top.nextAction}`);
  if (top.nextDetail) console.log(`  └ ${top.nextDetail}`);
  const kindLabel = top.state === 'blocked' ? '사람 몫 — AI가 대신 못 함' : null;
  if (kindLabel) console.log(`  걸린 것: ${kindLabel}`);

  printBlockers();

  console.log('\n※ 이 명령은 알려주기만 합니다. 실제 실행은 소담루프엔지니어링 담당입니다.');
}
