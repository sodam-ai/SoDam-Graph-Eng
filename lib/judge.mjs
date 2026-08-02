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
import { loadGraph } from './loadGraph.mjs';
import { scanAll } from './scan.mjs';
import { REPO_ROOT } from './safeWrite.mjs';
import { commitExists } from './gitSafe.mjs';
import { readShadow } from './shadow.mjs';

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

/** CLI: node lib/judge.mjs */
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const graph = loadGraph();
  const { snapshot, rescanned } = freshSnapshot(graph);
  const stamp = String(snapshot.scanned_at).slice(11, 16);

  console.log(`다음 할 일 — 소담 7형제   [${stamp} 기준${rescanned ? ' · 방금 다시 훑음' : ''}]\n`);

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
