/**
 * judge.mjs — 형제별 "다음 할 일 1개"를 판정한다
 *
 * 규격: 03_PHASES.md M4 `done_when`
 *   "7형제 각각에 다음 할 일 1개 문장이 출력됨.
 *    상세를 모르는 형제는 `coarse` 로 표시하고
 *    **1층 요약(미완료 N건·마지막 갱신일)과 `/graph-shadow` 안내**를 함께 출력"
 *
 * 🔴 절대 금지 (04 §절대 하지 마):
 *   · **`미상` 이라고 쓰지 않는다.** 1층 추출이 되는 형제는 "모르는" 게 아니라
 *     **"거칠게 아는"** 상태입니다. 그 표기를 쓰면 2층 추출 설계가 무력화됩니다.
 *   · **그럴듯한 마일스톤을 지어내지 않는다.** 모르면 모른다고 근거와 함께 말합니다.
 *   · **실행하지 않는다.** 판정하고 알려주는 데서 멈춥니다 (실행은 소담루프엔지니어링).
 *
 * M4 범위: **판정만.** `done` 자동 승격(E1|E2)은 M11 에서 이 파일에 추가합니다.
 */

import { pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { loadGraph, loadGraphOrExit, DEFAULT_GRAPH_PATH } from './loadGraph.mjs';
import { scanAll, localDate } from './scan.mjs';
import { REPO_ROOT, safeWriteAtomic } from './safeWrite.mjs';
import { commitExists } from './gitSafe.mjs';
import { readShadow } from './shadow.mjs';
import { publishSnapshot } from './refresh.mjs';
import { withLock } from './lock.mjs';
import { readRejected, addRejected } from './rejected.mjs';

/** 저장된 스냅샷을 읽는다. 없으면 null (호출부가 새로 스캔) */
export function readSnapshot() {
  const p = resolvePath(REPO_ROOT, 'data', 'snapshot.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** 스냅샷이 오래됐는가 (06 §3-B 규약 D2 — 10분) */
export function isStale(snapshot, now = new Date(), minutes = 10) {
  if (!snapshot?.scanned_at) return true;
  const t = new Date(snapshot.scanned_at);
  if (Number.isNaN(t.getTime())) return true;
  return now - t > minutes * 60000;
}

/** 그림자(사람이 준 정보) 조회 — 06 §2 규칙 B */
function shadowFor(projectId) {
  try {
    return readShadow(projectId);
  } catch {
    return null;
  }
}

/** 한 형제의 마일스톤을 seq 순으로 */
function milestonesOf(graph, projectId) {
  return graph.milestones
    .filter((m) => m.project_id === projectId)
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

/** 이 마일스톤을 막고 있는 것 (edges 의 depends_on 역추적) */
function blockedBy(graph, milestoneId) {
  const dep = graph.edges.find((e) => e.from === milestoneId && e.type === 'depends_on');
  if (!dep) return null;
  const target = graph.milestones.find((m) => m.id === dep.to);
  const proj = target ? graph.projects.find((p) => p.id === target.project_id) : null;
  return { note: dep.note, targetName: proj?.name_ko ?? dep.to };
}

/** 1층 요약 문장 — 숫자와 날짜로만 말한다 (S-4.3) */
function coarseSummary(snap) {
  if (!snap?.coarse) return null;
  const c = snap.coarse;
  const bits = [];
  if (c.oversized) {
    bits.push('진행 기록 파일이 너무 커서(5MB 초과) 읽지 않았습니다');
  } else if (c.checkpoint_lines > 0) {
    bits.push(`진행 기록 ${c.checkpoint_lines.toLocaleString()}줄`);
    bits.push(`완료 표시 ${c.done_markers}개`);
    bits.push(`미완료 ${c.open_checkboxes}건`);
  } else {
    bits.push('진행 기록 파일 없음 (git 활동만으로 판단)');
  }
  if (c.checkpoint_mtime) bits.push(`마지막 갱신 ${c.checkpoint_mtime}`);
  else if (snap.git_last_commit_date) bits.push(`마지막 커밋 ${snap.git_last_commit_date}`);
  return bits.join(' · ');
}

/**
 * 형제 하나를 판정한다.
 * @returns {{project_id, name_ko, kind, text, detail, coarse_summary, milestone_id}}
 */
export function judgeProject(graph, snapshot, projectId) {
  const p = graph.projects.find((x) => x.id === projectId);
  const snap = snapshot.projects.find((x) => x.project_id === projectId);
  const base = {
    project_id: projectId,
    name_ko: p?.name_ko ?? projectId,
    milestone_id: null,
    coarse_summary: null,
    detail: null,
  };

  // ① 경로부터 — 못 찾았으면 다른 판정이 의미 없다
  if (!snap || !snap.repo_root) {
    const why =
      snap?.resolve_status === 'rejected_path'
        ? 'graph.json 의 markers 가 안전하지 않은 경로여서 거부했습니다 (파일을 읽지 않았습니다)'
        : '저장소를 못 찾았습니다 (경로 유실)';
    return {
      ...base,
      kind: 'path_problem',
      text: `먼저 위치를 찾아야 합니다 — ${why}`,
      detail: 'data/graph.json 의 config.search_roots 와 markers 를 확인하세요.',
    };
  }

  const list = milestonesOf(graph, projectId);
  const open = list.find((m) => m.state !== 'done');

  // ② 전부 끝남
  if (!open) {
    return { ...base, kind: 'all_done', text: '남은 단계가 없습니다.' };
  }

  base.milestone_id = open.id;
  const summary = coarseSummary(snap);

  // ③ coarse — 그림자(사람이 준 정보)가 있으면 그것으로 대체 (06 §2 규칙 B)
  if (open.state === 'coarse') {
    const sh = shadowFor(projectId);
    if (sh) {
      return {
        ...base,
        kind: 'shadow',
        coarse_summary: summary,
        text: `시작: ${sh.title ?? '다음 할 일'}`,
        detail:
          (sh.done_when ? `${sh.done_when}` : null) +
          (sh.stale
            ? ' · ⚠ 형제 쪽 기록이 그 뒤에 바뀌었습니다 — /graph-shadow 로 다시 정리하면 정확해집니다'
            : ''),
      };
    }
    // 🆕 W-2 — 1.5층 원문 인용이 있으면 "모르겠습니다" 대신 그 문장을 쓴다 (02 §1.5층)
    const items = snap?.coarse?.open_items ?? [];
    if (items.length > 0) {
      const restCount = Math.max((snap?.coarse?.open_checkboxes ?? items.length) - 1, 0);
      return {
        ...base,
        kind: 'coarse',
        coarse_summary: summary,
        text:
          `(추정 — 사람 확인 전) 다음 할 일 후보: "${items[0]}"` +
          (restCount > 0 ? ` 외 ${restCount}건` : ''),
        detail:
          `근거: ${summary ?? '판단 근거 부족'} · 형제 CHECKPOINT.md 의 미완료 표시 원문 인용` +
          ' · 정확히 하려면 `/graph-shadow` 로 한 번만 정리하세요.',
      };
    }
    return {
      ...base,
      kind: 'coarse',
      coarse_summary: summary,
      text: `상세 단계는 아직 거친 판정입니다 — ${summary ?? '판단 근거 부족'}`,
      detail: '`/graph-shadow` 로 한 번만 정리하면 그다음부터 자동 판정됩니다.',
    };
  }

  // ④ blocked — 무엇이 막고 있는지 함께
  if (open.state === 'blocked') {
    const b = blockedBy(graph, open.id);
    return {
      ...base,
      kind: 'blocked',
      coarse_summary: summary,
      text: `${open.title} — 막혀 있습니다`,
      detail: b
        ? `${b.targetName} 이(가) 먼저 진행돼야 합니다.${b.note ? ` (${b.note})` : ''}`
        : (open.done_when ?? '막힌 이유가 기록돼 있지 않습니다.'),
    };
  }

  // ⑤ verified — 완료 조건 확인이 다음 할 일
  if (open.state === 'verified') {
    return {
      ...base,
      kind: 'verified',
      coarse_summary: summary,
      text: `${open.title} — 완료 조건을 확인할 차례입니다`,
      detail: open.done_when ?? null,
    };
  }

  // ⑥ doing / todo
  const verb = open.state === 'doing' ? '이어서 진행' : '시작';
  return {
    ...base,
    kind: open.state,
    coarse_summary: summary,
    text: `${verb}: ${open.title}`,
    detail: open.done_when ?? null,
  };
}

/** 7형제 전부 판정 */
export function judgeAll(graph, snapshot) {
  return graph.projects.map((p) => judgeProject(graph, snapshot, p.id));
}

/* ══════════════════════════════════════════════════════════════
 * M7 — 불일치 표시
 *
 * 규격: 03_PHASES.md M7 `done_when`
 *   "graph.json 상태와 실측이 어긋나는 형제가 있으면 경고 문구가 출력됨
 *    (**조용히 통과하지 않음**)"
 *   02_DATA_MODEL.md §흐름 4 — "조용히 덮어쓰지 않고 어긋났다고 표시한다"
 *
 * 🔴 왜 필요한가:
 *   정본(사람이 정한 계획)을 기계가 조용히 덮어쓰면 **어긋난 걸 아무도 모릅니다.**
 *   따로 두고 **대조해서 보여주는 것**이 이 프로젝트의 설계 전제입니다.
 * ══════════════════════════════════════════════════════════════ */

/** 오늘(로컬) YYYY-MM-DD */
function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** `evidence` 문자열에서 커밋 해시처럼 보이는 것을 뽑는다 */
function extractHashes(evidence) {
  if (typeof evidence !== 'string') return [];
  return [...evidence.matchAll(/\b([0-9a-f]{7,40})\b/g)]
    .map((m) => m[1])
    // 날짜(2026-08-02)의 조각이나 순수 숫자는 제외 — 해시는 글자를 포함한다
    .filter((h) => /[a-f]/.test(h));
}

/**
 * 정본과 실측을 대조한다.
 * @returns {Array<{project_id,name_ko,severity,kind,text,detail}>}
 */
export function collectMismatches(graph, snapshot, { checkCommits = true } = {}) {
  const out = [];
  const today = todayStr();
  const snapOf = new Map(snapshot.projects.map((s) => [s.project_id, s]));

  const push = (p, severity, kind, text, detail) =>
    out.push({ project_id: p.id, name_ko: p.name_ko, severity, kind, text, detail });

  for (const p of graph.projects) {
    const s = snapOf.get(p.id);
    if (!s) continue;

    // ── A. 경로 문제 — 다른 판정이 의미 없으므로 최우선
    if (s.resolve_status === 'lost') {
      push(p, 'high', 'path', '저장소를 못 찾았습니다 (경로 유실)', 'config.search_roots 확인 필요');
      continue;
    }
    if (s.resolve_status === 'rejected_path') {
      push(p, 'high', 'path', 'markers 경로가 거부됐습니다', 'graph.json 의 markers 를 확인하세요 (08 S-2)');
      continue;
    }

    const list = graph.milestones
      .filter((m) => m.project_id === p.id)
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

    for (const m of list) {
      // ── B. 미래 날짜 — 데이터 오류
      if (m.last_moved_at > today) {
        push(p, 'medium', 'future_date', `${m.id} 의 날짜가 미래입니다 (${m.last_moved_at})`, '오타이거나 시계가 어긋난 상태');
      }

      // ── C. 적어놓은 증거가 실재하는가 (06 §1 E2)
      if (checkCommits && m.evidence && s.repo_root) {
        for (const h of extractHashes(m.evidence)) {
          if (!commitExists(s.repo_root, h)) {
            push(
              p,
              'high',
              'ghost_evidence',
              `${m.id} 의 증거 커밋 ${h} 가 저장소에 없습니다`,
              '증거가 실재하지 않으면 그 완료 판정을 믿을 수 없습니다'
            );
          }
        }
      }
    }

    const open = list.find((m) => m.state !== 'done');

    // ── D. done 처리됐는데 실측상 미완료 흔적 (가짜 완료 의심)
    if (!open && s.coarse && s.coarse.open_checkboxes > 0) {
      push(
        p,
        'high',
        'fake_done',
        `전부 done 인데 진행 기록에 미완료 ${s.coarse.open_checkboxes}건이 남아 있습니다`,
        '가짜 완료일 수 있습니다 — 되돌리려면 /graph-undo'
      );
    }

    if (open) {
      // ── E. 진행 중인데 오래 조용함 (정체 축 기준 — 12차)
      const days = s.days_in_state;
      if (days !== null && days >= graph.config.stall_days && open.state !== 'coarse') {
        push(
          p,
          'medium',
          'stalled',
          `${open.id} 가 ${open.state} 상태로 ${days}일째입니다 (기준 ${graph.config.stall_days}일)`,
          open.state === 'verified' ? '검증은 끝났는데 완료로 안 넘어간 상태입니다' : null
        );
      }

      // ── F. coarse 인데 추적 파일이 실제로 있음 → 그림자로 해소 가능
      if (open.state === 'coarse' && s.tracking_files.length > 0) {
        push(
          p,
          'low',
          'resolvable_coarse',
          `거친 판정이지만 진행 기록(${s.tracking_files.join(', ')})이 있습니다`,
          '/graph-shadow 로 한 번만 정리하면 정상 판정으로 바뀝니다'
        );
      }
    }

    // ── G. 스캐너가 이미 담아둔 것 (파일 과대 등) — 중복은 위에서 다룬 것만 걸러낸다
    for (const msg of s.mismatch ?? []) {
      if (/경로 (유실|거부)/.test(msg)) continue;
      if (/활동 없음/.test(msg)) continue; // E 가 정체 축으로 더 정확히 다룸
      if (/계획 상태=/.test(msg)) continue; // D·E 가 다룸
      push(p, 'low', 'scanner', msg, null);
    }
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** 스냅샷 확보 — 없거나 오래됐으면 새로 스캔 (06 §3-B D2) */
export function freshSnapshot(graph, { maxAgeMin = 10 } = {}) {
  const cached = readSnapshot();
  if (cached && !isStale(cached, new Date(), maxAgeMin)) {
    return { snapshot: cached, rescanned: false };
  }
  const { snapshot } = scanAll(graph);
  return { snapshot, rescanned: true };
}

/* ══════════════════════════════════════════════════════════════
 * M11 — done 자동 승격 (E1|E2 필수 + 보조 1개) + 되돌리기 + 동시성 방어
 *
 * 규격: 06_ANTI_STALL_SPEC.md §1 · 03_PHASES.md M11
 *
 * 🔴 이 절이 처음으로 graph.json(정본)에 씁니다. scan·judge·publish·shadow 는
 *    전부 읽기만 했습니다. 그래서 세 가지를 반드시 지킵니다:
 *    ① lock 으로 동시 쓰기를 막고
 *    ② lock 안에서 **최신 원본을 다시 읽어** 그 위에 적용합니다 — 낡은 스냅샷
 *       기준으로 쓰면 다른 세션의 변경을 덮어쓰는 Lost Update 가 됩니다
 *    ③ 상태가 기대값과 다르면(다른 세션이 이미 바꿈) 건너뜁니다 (낙관적 동시성 제어)
 *
 * 🔴 "침묵하면 진행"의 안전한 구현 — 최소 1턴 지연:
 *    이번 판정에서 새로 verified→done_candidate 로 올린 것은 **이번 실행에서
 *    바로 done 으로 확정하지 않습니다.** confirmCandidates() 를 promoteCandidates()
 *    보다 먼저 호출해, "지난 실행에서 이미 제안됐고 그동안 거부가 없었던 것"만
 *    done 으로 확정합니다. 그래야 사용자가 볼 기회가 최소 한 번 보장됩니다.
 * ══════════════════════════════════════════════════════════════ */

/** done_when 텍스트에서 파일 경로처럼 보이는 조각을 뽑는다 (E1) */
const FILE_PATH_RE = /[\w./\\-]+\.(?:md|mjs|js|json|txt|sh|yml|yaml)\b/gi;

function extractFilePaths(text) {
  if (typeof text !== 'string') return [];
  return [...text.matchAll(FILE_PATH_RE)].map((m) => m[0]);
}

/**
 * 🔴 이 문구가 있으면 E1|E2 가 기술적으로 통과해도 자동승격 후보에서 제외한다.
 * 실측(sodam-graph-eng.M5)으로 드러난 구멍 — evidence 에 "사람 눈 확인 대기"라고
 * 적혀 있는데 owner=ai·Blocker=0 이라 기존 필터(owner=human && Blocker.kind)로는
 * 전혀 안 걸렀다. E1|E2 는 실물 증거일 뿐, 그 실물이 "완료를 의미하는지"는
 * 기계가 판단할 수 없으므로 사람이 직접 적어둔 유보 표현을 최우선으로 존중한다.
 * 🆕 2026-08-20 — "사람" 동의어 "사용자"도 포함(예방적 보강). 이 프로젝트 문서·대화에서
 * "사람"·"사용자"가 같은 뜻으로 섞여 쓰이는 걸 확인해 추가했다. 실제 20개 마일스톤
 * 전수 재판정 결과 신·구 정규식의 판정은 0건 차이(현재 데이터엔 이 사각지대에
 * 해당하는 실사례가 없었음) — 지금 버그를 고친 게 아니라 다음 마일스톤이 "사람"
 * 대신 "사용자"로 적힐 때를 대비한 것이다.
 */
const HUMAN_CONFIRM_RE =
  /(?:사람|사용자)\s*(?:눈\s*)?확인|(?:사람|사용자)\s*확인\s*필요|사람\s*몫/;

function needsHumanConfirm(milestone) {
  return HUMAN_CONFIRM_RE.test(`${milestone.evidence ?? ''} ${milestone.done_when ?? ''}`);
}

/** Blocker 기반 자동승격 제외 — owner=human && kind ∈ {legal,purchase,external_account} (06 §1) */
function isHumanGated(milestone, graph) {
  if (milestone.owner !== 'human') return false;
  return graph.blockers.some(
    (b) => b.milestone_id === milestone.id && ['legal', 'purchase', 'external_account'].includes(b.kind)
  );
}

function daysSince(dateStr, nowMs) {
  if (!dateStr) return null;
  const then = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  return Math.max(0, Math.floor((nowMs - then.getTime()) / 86400000));
}

/**
 * 승격 후보 여부를 판정한다. E1~E3 은 판정 불가하면 `null`(지어내지 않음) —
 * 필수/보조 계산에서는 `true` 만 인정하고 `null`은 미충족으로 취급한다.
 * @returns {{eligible:boolean, reason:string, evidence?:object}}
 */
export function evaluatePromotion(milestone, graph, snapshot, nowMs = Date.now()) {
  if (milestone.state !== 'verified') return { eligible: false, reason: 'verified 상태가 아님' };
  if (needsHumanConfirm(milestone)) {
    return { eligible: false, reason: '증거에 "사람 확인" 문구가 있어 자동승격 제외' };
  }
  if (isHumanGated(milestone, graph)) {
    return { eligible: false, reason: '사람 몫 블로커(legal/purchase/external_account)가 있어 제외' };
  }

  const snap = snapshot.projects.find((s) => s.project_id === milestone.project_id);
  const repoRoot = snap?.repo_root;
  if (!repoRoot) return { eligible: false, reason: '저장소 경로를 못 찾음 — 승격 보류' };

  const filePaths = extractFilePaths(milestone.done_when);
  const e1 = filePaths.length === 0 ? null : filePaths.some((p) => existsSync(resolvePath(repoRoot, p)));

  const hashes = extractHashes(milestone.evidence);
  const e2 = hashes.length === 0 ? null : hashes.some((h) => commitExists(repoRoot, h));

  const e3 = snap.git_last_commit_date ? snap.git_last_commit_date > milestone.last_moved_at : null;
  const e4 = (daysSince(milestone.last_moved_at, nowMs) ?? -1) >= (graph.config.stall_days ?? 7);
  const e5 = !graph.blockers.some((b) => b.milestone_id === milestone.id);

  const evidence = { E1: e1, E2: e2, E3: e3, E4: e4, E5: e5 };
  const hasRequired = e1 === true || e2 === true;
  const supportCount = [e3 === true, e4 === true, e5 === true].filter(Boolean).length;

  if (!hasRequired) return { eligible: false, reason: 'E1|E2 필수 조건 미충족 (실물 증거 없음)', evidence };
  if (supportCount < 1) return { eligible: false, reason: '보조 증거(E3~E5) 부족', evidence };

  return { eligible: true, reason: `E1|E2 충족 + 보조 ${supportCount}개`, evidence };
}

/**
 * lock 을 잡고 **최신 원본을 재로드**해 그 위에 적용한다 (Lost Update 방지).
 * @param {Array<{milestoneId:string, expectedFrom:string, toState:string, at:string}>} updates
 * @returns {{ok:true, applied:string[]} | {ok:false, reason:string}}
 */
function applyMilestoneUpdates(updates) {
  if (updates.length === 0) return { ok: true, applied: [] };
  const res = withLock(() => {
    const raw = JSON.parse(readFileSync(DEFAULT_GRAPH_PATH, 'utf8')); // 파생 필드 없는 순수 원본
    const applied = [];
    for (const u of updates) {
      const m = raw.milestones.find((x) => x.id === u.milestoneId);
      if (!m) continue; // 이미 없어졌을 수 있음 — 건너뜀
      if (m.state !== u.expectedFrom) continue; // 낙관적 동시성 제어 — 다른 세션이 이미 바꿈
      m.state = u.toState;
      m.last_moved_at = u.at;
      applied.push(u.milestoneId);
    }
    if (applied.length > 0) {
      safeWriteAtomic(DEFAULT_GRAPH_PATH, `${JSON.stringify(raw, null, 2)}\n`);
    }
    return applied;
  });
  if (!res.ok) return { ok: false, reason: res.reason };
  return { ok: true, applied: res.value };
}

/** verified → done_candidate 로 새로 제안한다 (이번 실행에서 바로 done 이 되지 않음). */
export function promoteCandidates(graph, snapshot) {
  const nowMs = Date.now();
  const today = localDate(new Date(nowMs));
  const proposals = [];
  const nameOf = new Map(graph.projects.map((p) => [p.id, p.name_ko]));
  // 🔧 거부 이력 확인 — reject 는 done_candidate→verified 로 되돌리므로, 여기서
  //    다시 거르지 않으면 "재제안 방지"가 다음 판정에서 무력화된다.
  const rejectedIds = new Set(readRejected().entries.map((e) => e.milestone_id));

  for (const m of graph.milestones) {
    if (m.state !== 'verified') continue;
    if (rejectedIds.has(m.id)) continue; // 06 §1 "같은 항목을 다시 제안하지 않는다"
    const result = evaluatePromotion(m, graph, snapshot, nowMs);
    if (result.eligible) {
      proposals.push({
        milestone_id: m.id,
        name_ko: nameOf.get(m.project_id) ?? m.project_id,
        title: m.title,
        reason: result.reason,
        evidence: result.evidence,
      });
    }
  }

  const updates = proposals.map((p) => ({
    milestoneId: p.milestone_id,
    expectedFrom: 'verified',
    toState: 'done_candidate',
    at: today,
  }));
  const res = applyMilestoneUpdates(updates);
  if (!res.ok) return { proposals: [], lockFailed: true, reason: res.reason };

  const appliedSet = new Set(res.applied);
  return { proposals: proposals.filter((p) => appliedSet.has(p.milestone_id)), lockFailed: false };
}

/**
 * done_candidate 중 지난 실행에서 이미 제안됐고 그동안 거부가 없었던 것을 done 으로 확정한다.
 * 🔴 promoteCandidates() 보다 **먼저** 호출해야 최소 1턴 지연이 보장됩니다.
 */
export function confirmCandidates(graph) {
  const rejectedIds = new Set(readRejected().entries.map((e) => e.milestone_id));
  const today = localDate(new Date());
  const targets = graph.milestones.filter((m) => m.state === 'done_candidate' && !rejectedIds.has(m.id));
  const updates = targets.map((m) => ({
    milestoneId: m.id,
    expectedFrom: 'done_candidate',
    toState: 'done',
    at: today,
  }));
  const res = applyMilestoneUpdates(updates);
  if (!res.ok) return { confirmed: [], lockFailed: true, reason: res.reason };
  return { confirmed: res.applied, lockFailed: false };
}

/** `/graph-reject` — 승격 **전**(done_candidate) 거부. verified 로 복귀 + 재제안 방지 기록. */
export function rejectCandidate(milestoneId, reason = null) {
  const res = applyMilestoneUpdates([
    { milestoneId, expectedFrom: 'done_candidate', toState: 'verified', at: localDate(new Date()) },
  ]);
  if (!res.ok) return { ok: false, reason: res.reason };
  if (res.applied.length === 0) {
    return {
      ok: false,
      reason:
        '승격 대기(done_candidate) 상태가 아니거나 다른 세션에서 이미 바뀌었습니다. 이미 done 이면 /graph-undo 를 쓰세요.',
    };
  }
  addRejected(milestoneId, reason);
  return { ok: true };
}

/** `/graph-undo` — 승격 **후**(done) 되돌리기. verified 로 복귀 (거부 이력은 남기지 않음). */
export function undoMilestone(milestoneId) {
  const res = applyMilestoneUpdates([
    { milestoneId, expectedFrom: 'done', toState: 'verified', at: localDate(new Date()) },
  ]);
  if (!res.ok) return { ok: false, reason: res.reason };
  if (res.applied.length === 0) {
    return {
      ok: false,
      reason: 'done 상태가 아니거나 다른 세션에서 이미 바뀌었습니다. 승격 전이면 /graph-reject 를 쓰세요.',
    };
  }
  return { ok: true };
}

/**
 * CLI: node lib/judge.mjs                              → 판정 (기존 동작)
 *      node lib/judge.mjs --reject <마일스톤ID> [--reason "이유"]  → M11 /graph-reject
 *      node lib/judge.mjs --undo <마일스톤ID>                     → M11 /graph-undo
 */
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const argv = process.argv.slice(2);
  const rejectIdx = argv.indexOf('--reject');
  const undoIdx = argv.indexOf('--undo');

  if (rejectIdx >= 0) {
    const id = argv[rejectIdx + 1];
    const reasonIdx = argv.indexOf('--reason');
    const reason = reasonIdx >= 0 ? argv[reasonIdx + 1] : null;
    if (!id || id.startsWith('--')) {
      console.log('사용법: node lib/judge.mjs --reject <마일스톤ID> [--reason "이유"]');
      process.exit(0);
    }
    const r = rejectCandidate(id, reason);
    console.log(
      r.ok
        ? `거부 완료 — ${id} 는 verified 로 복귀했습니다. 다시 제안되지 않습니다.`
        : `실패 — ${r.reason}`
    );
    process.exit(0);
  }

  if (undoIdx >= 0) {
    const id = argv[undoIdx + 1];
    if (!id || id.startsWith('--')) {
      console.log('사용법: node lib/judge.mjs --undo <마일스톤ID>');
      process.exit(0);
    }
    const r = undoMilestone(id);
    console.log(r.ok ? `되돌리기 완료 — ${id} 는 verified 로 복귀했습니다.` : `실패 — ${r.reason}`);
    process.exit(0);
  }

  const graph = loadGraphOrExit(); // M15
  const { snapshot, rescanned } = freshSnapshot(graph);
  const stamp = String(snapshot.scanned_at).slice(11, 16);

  // 🆕 M11 — 지난 제안 확정(먼저) → 새 제안(나중) — 최소 1턴 지연 보장
  const confirmed = confirmCandidates(graph);
  for (const id of confirmed.confirmed ?? []) {
    const m = graph.milestones.find((x) => x.id === id);
    if (m) m.state = 'done'; // 표시 일관성 — 이번 출력에 바로 반영
  }
  const promoted = promoteCandidates(graph, snapshot);
  for (const p of promoted.proposals) {
    const m = graph.milestones.find((x) => x.id === p.milestone_id);
    if (m) m.state = 'done_candidate';
  }

  // 🆕 W-1 배선 — 판정 직후 공유 발행 (02 §발행 배선 P-1: "판정 명령 실행 끝"이 호출 지점 ①)
  const pub = publishSnapshot(graph, snapshot);
  if (process.env.SODAM_GRAPH_DEBUG === '1') {
    console.log(pub.ok ? `[발행] ${pub.path} (${pub.bytes}B)` : `[발행 생략] ${pub.reason}`);
  }

  console.log(`다음 할 일 — 소담 7형제   [${stamp} 기준${rescanned ? ' · 방금 다시 훑음' : ''}]\n`);

  // 🆕 M11 — 확정·제안 알림 (목록보다 먼저)
  if (confirmed.lockFailed) {
    console.log(`⚠ 승격 확정 보류 — ${confirmed.reason}\n`);
  } else if (confirmed.confirmed.length > 0) {
    console.log(`✅ 자동 확정됨(거부 없어 done 처리): ${confirmed.confirmed.join(', ')}\n`);
  }
  if (promoted.lockFailed) {
    console.log(`⚠ 승격 제안 보류 — ${promoted.reason}\n`);
  } else if (promoted.proposals.length > 0) {
    console.log(`[done 승격 제안] ${promoted.proposals.length}건`);
    for (const p of promoted.proposals) {
      const ev = p.evidence ?? {};
      const fmt = (v) => (v === null || v === undefined ? '해당없음' : v ? 'O' : 'X');
      console.log(`  ${p.name_ko} · ${p.title}`);
      console.log(
        `    근거: E1 ${fmt(ev.E1)} / E2 ${fmt(ev.E2)} / E3 ${fmt(ev.E3)} / E4 ${fmt(ev.E4)} / E5 ${fmt(ev.E5)}`
      );
      console.log('    → 아니라고 말씀 안 하시면 다음 스캔에서 done 처리합니다.');
      console.log(`       되돌리려면: /graph-reject ${p.milestone_id}`);
    }
    console.log('');
  }

  // M7 — 정본과 실측이 어긋나면 **목록보다 먼저** 알린다 (조용히 통과하지 않음)
  const mism = collectMismatches(graph, snapshot);
  if (mism.length > 0) {
    const SEV = { high: '🔴', medium: '🟠', low: '🟡' };
    console.log(`⚠ 계획과 실제가 어긋난 곳 ${mism.length}건`);
    for (const w of mism) {
      console.log(`  ${SEV[w.severity]} ${w.name_ko} — ${w.text}`);
      if (w.detail) console.log(`     └ ${w.detail}`);
    }
    console.log('\n  (정본 graph.json 을 자동으로 고치지 않습니다 — 어긋난 사실만 알립니다)\n');
  }

  const MARK = {
    path_problem: '🔴',
    blocked: '⏸',
    coarse: '🟡',
    all_done: '✅',
  };

  for (const j of judgeAll(graph, snapshot)) {
    console.log(`${MARK[j.kind] ?? '▶'} ${j.name_ko}`);
    console.log(`   ${j.text}`);
    if (j.detail) console.log(`   └ ${j.detail}`);
    console.log('');
  }

  console.log('※ 이 명령은 알려주기만 합니다. 실제 실행은 소담루프엔지니어링 담당입니다.');
}
