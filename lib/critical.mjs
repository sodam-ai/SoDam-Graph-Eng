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
import { freshSnapshot, judgeProject, daysSince, activityLabel } from './judge.mjs';
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

  // 위치를 못 찾은 형제 — 순환·전부 완료 여부와 **상관없이** 모은다. 아래 제외 규칙에 먼저
  // 걸리면 못 찾았다는 사실까지 사라진다. 잰 값이 없으니 "0일"이 아니라 "모름" (02 §resolve 절차 3)
  const unresolved = graph.projects
    .filter((p) => !snapshot.projects.find((s) => s.project_id === p.id)?.repo_root)
    .map((p) => p.id);

  const rows = [];
  for (const p of graph.projects) {
    if (cycleProjects.has(p.id)) continue; // 순환에 속하면 점수 계산에서 제외
    const open = openMilestoneOf(graph, p.id);
    if (!open) continue; // 전부 done — 지목할 게 없음
    if (unresolved.includes(p.id)) continue; // 못 찾은 곳은 순위에 올리지 않는다

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
      activityDays: snap?.days_since_activity ?? null, // 표시 전용 — 점수에는 안 씀
      blockingCount: blockers.size,
      blockingNames: [...blockers].map((id) => nameKoOf(graph, id)),
      confidence,
      score,
    });
  }

  rows.sort((a, b) => b.score - a.score);
  return { ranked: rows, cycles, excludedCount: cycleProjects.size, unresolved };
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

/**
 * 막힌 이유 — 기록된 사실만 말한다.
 * "사람 몫"은 블로커가 실제로 기록돼 있을 때만. 다른 형제를 기다리는 것은 사람 할 일이 아니다.
 */
function stuckReason(graph, row) {
  const parts = [];
  if (graph.blockers.some((b) => b.milestone_id === row.milestone_id)) parts.push('사람 몫 — AI가 대신 못 함');
  const waiting = graph.edges
    .filter((e) => e.from === row.milestone_id && e.type === 'depends_on')
    .map((e) => graph.milestones.find((m) => m.id === e.to))
    .filter((m) => m && m.state !== 'done' && m.project_id !== row.project_id)
    .map((m) => nameKoOf(graph, m.project_id));
  if (waiting.length > 0) parts.push(`다른 형제 진행 대기 — ${[...new Set(waiting)].join(', ')}`);
  return parts.length > 0 ? parts.join(' · ') : '막힌 이유가 기록돼 있지 않음';
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

  const { ranked, cycles, excludedCount, unresolved } = computeCriticalPath(graph, snapshot);

  if (cycles.length > 0) {
    console.log('🔴 순환 의존 발견 — 서로가 서로를 기다려서 영원히 안 끝나는 상태입니다');
    for (const c of cycles) {
      console.log(`   ${c.map((id) => nameKoOf(graph, id)).join(' → ')} → (처음으로 되돌아옴)`);
    }
    console.log(`   순환에 속한 ${excludedCount}곳은 점수 계산에서 제외했습니다 — 하나를 떼어내야 풀립니다.\n`);
  }

  if (unresolved.length > 0) {
    console.log(
      `⚠ 위치를 못 찾은 형제 ${unresolved.length}곳은 순위에서 뺐습니다 — ${unresolved.map((id) => nameKoOf(graph, id)).join(', ')}`
    );
    console.log('   이 중에 더 오래 멈춘 곳이 있을 수 있습니다. /graph-where <이름> 으로 확인하세요.\n');
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
    const reason =
      unresolved.length > 0
        ? '위치를 못 찾은 곳을 빼면 순위를 매길 곳이 없습니다 (위 안내 참고)'
        : '전부 완료됐거나 순환에 걸려 있습니다';
    console.log(`지금 지목할 것이 없습니다 — ${reason}.   [${stamp} 기준${rescannedTag}]`);
    printBlockers();
    process.exit(0);
  }

  const top = ranked[0];
  const confTag = top.confidence < 1 ? '   (상세 미상 — 추정치)' : '';
  console.log(`[지금 딱 하나만 푼다면]  ${top.name_ko} · ${top.title}   [${stamp} 기준${rescannedTag}]\n`);
  console.log('  이유:');
  const stallText =
    top.state === 'coarse'
      ? `단계 추적 안 됨 — 기록이 ${top.days}일째 그대로 (실제로 멈췄는지는 이 숫자만으로 알 수 없음)`
      : `${top.days}일 정지 (정체 축 기준)`;
  const topActivity = activityLabel(top.activityDays);
  console.log(`   · ${stallText}${topActivity ? ` · ${topActivity}` : ''}`);
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
      `     2위 ${second.name_ko}  ${second.days} × (1+${second.blockingCount}) × ${second.confidence} = ${second.score.toFixed(1)}  보다 ${ratio}배` +
        (second.state === 'coarse' ? '   (단계 추적 안 됨)' : '')
    );
  }
  console.log(`\n  다음 할 일: ${top.nextAction}`);
  if (top.nextDetail) console.log(`  └ ${top.nextDetail}`);
  if (top.state === 'blocked') console.log(`  걸린 것: ${stuckReason(graph, top)}`);

  printBlockers();

  console.log('\n※ 이 명령은 알려주기만 합니다. 실제 실행은 소담루프엔지니어링 담당입니다.');
}
