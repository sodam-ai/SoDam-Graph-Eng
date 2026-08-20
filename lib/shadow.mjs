/**
 * shadow.mjs — 그림자 추적 (data/shadow/)
 *
 * 규격: 06_ANTI_STALL_SPEC.md §2 규칙 B
 *   "읽기 전용 결정 때문에 추적 파일이 없는 형제는 영원히 판정 불가.
 *    → 쓰기는 전부 **그래프 저장소 안**에서. 형제 저장소는 한 글자도 안 건드린다."
 *
 * 🔴 원칙 (06 §2)
 *   · 그림자는 **사람이 준 정보만** 담는다. **기계가 추측해서 채우지 않는다.**
 *   · 나중에 형제 쪽에서 마일스톤을 읽을 수 있게 되면 **그쪽이 우선**이고 그림자는 후퇴한다.
 *   · `data/shadow/` 는 **git 추적** — 사람이 준 정보라 잃어버리면 안 된다.
 *   · 🔴 **사용자가 답을 안 해도 Phase 1 은 완료된다.** 그때는 coarse 와 그 이유를 표시하면 통과.
 *     ("판정 불가 0개"를 완료 조건으로 걸면 사람 대기 → 정체가 재발한다)
 *
 * 🔴 한꺼번에 다 받지 않는다 (10차 보강)
 *   형제당 2문항 × 6형제 = 12문항이면 **사용자가 안 답합니다.**
 *   먼저 2곳만 권합니다 — 추적 파일이 아예 없는 곳, 그리고 완료가 임박해 보이는 곳.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadGraph, loadGraphOrExit } from './loadGraph.mjs';
// 🔴 judge.mjs 를 import 하지 않습니다 — judge 가 이 파일의 readShadow 를 쓰므로
//    서로 부르면 순환 import 가 됩니다. CLI 는 scan 을 직접 씁니다.
import { scanAll, maskSecrets, localDate } from './scan.mjs';
import { safeWrite, REPO_ROOT } from './safeWrite.mjs';

const SHADOW_DIR = resolvePath(REPO_ROOT, 'data', 'shadow');
const MAX_TEXT = 500; // S-7 입력 상한

export function shadowPath(projectId) {
  return resolvePath(SHADOW_DIR, `${projectId}.md`);
}

/** 그림자 읽기 — 없으면 null */
export function readShadow(projectId) {
  const p = shadowPath(projectId);
  if (!existsSync(p)) return null;
  let raw;
  try {
    raw = readFileSync(p, 'utf8');
  } catch {
    return null;
  }
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fm) return null;

  const meta = {};
  for (const line of fm[1].split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  const body = fm[2];
  const pick = (k) => body.match(new RegExp(`^- ${k}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? null;

  return {
    project_id: meta.project_id ?? projectId,
    source: meta.source ?? 'user_input',
    recorded_at: meta.recorded_at ?? null,
    title: body.match(/^##\s+(.*)$/m)?.[1]?.trim() ?? null,
    state: pick('state'),
    done_when: pick('done_when'),
    owner: pick('owner'),
    evidence: pick('evidence'),
  };
}

/** S-7 — 사용자 입력 검증 */
function cleanText(s, label) {
  if (typeof s !== 'string' || s.trim().length === 0) {
    throw new Error(`${label} 이(가) 비어 있습니다.`);
  }
  const t = s.trim().replace(/\r?\n/g, ' ');
  if (t.length > MAX_TEXT) throw new Error(`${label} 이(가) 너무 깁니다 (${MAX_TEXT}자 이내).`);
  // S-4.6: shadow/ 는 git 추적 대상이므로 시크릿이 섞여도 남지 않게 한다
  return maskSecrets(t);
}

/**
 * 그림자 기록 — **사람이 준 답만** 넣는다.
 * @param {string} projectId
 * @param {{last: string, next: string, owner?: string}} answers
 */
export function writeShadow(projectId, { last, next, owner = 'human' }) {
  const doneTitle = cleanText(last, '마지막으로 끝낸 것');
  const nextTitle = cleanText(next, '다음에 할 일');
  const today = localDate(new Date());

  const md =
    `---\n` +
    `project_id: ${projectId}\n` +
    `source: user_input\n` +
    `recorded_at: ${today}\n` +
    `---\n\n` +
    `## ${nextTitle}\n` +
    `- state: todo\n` +
    `- done_when: ${nextTitle} 을(를) 끝내고 그 결과를 기록\n` +
    `- owner: ${owner}\n` +
    `- evidence: (직전 완료) ${doneTitle}\n\n` +
    `> 사람이 직접 알려준 내용입니다. 기계가 추측해서 채우지 않았습니다.\n` +
    `> 형제 저장소에서 마일스톤을 읽을 수 있게 되면 그쪽이 우선이고 이 파일은 뒤로 물러납니다.\n`;

  // 쓰기는 safeWrite 한 곳만 통과 (08 S-3 ②겹). data/shadow/ 는 그래프 저장소 안이라 허용됩니다.
  return safeWrite(shadowPath(projectId), md);
}

/** 기록된 그림자 전체 */
export function listShadows() {
  if (!existsSync(SHADOW_DIR)) return [];
  try {
    return readdirSync(SHADOW_DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

/**
 * 그림자가 필요한 형제 + 권장 순서.
 * 🔴 한꺼번에 다 받지 말라는 규칙을 여기서 코드로 강제합니다.
 */
export function listNeedShadow(graph, snapshot) {
  const have = new Set(listShadows());
  const rows = [];

  for (const p of graph.projects) {
    const s = snapshot.projects.find((x) => x.project_id === p.id);
    const open = graph.milestones
      .filter((m) => m.project_id === p.id && m.state !== 'done')
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0];
    if (!open || open.state !== 'coarse') continue;

    const c = s?.coarse ?? {};
    const noTracking = (s?.tracking_files ?? []).length === 0;
    const nearDone = c.open_checkboxes > 0 && c.open_checkboxes <= 3;

    rows.push({
      id: p.id,
      name_ko: p.name_ko,
      recorded: have.has(p.id),
      noTracking,
      nearDone,
      // 우선순위: 추적 파일이 아예 없는 곳(1) → 완료 임박(2) → 나머지(3)
      priority: noTracking ? 1 : nearDone ? 2 : 3,
      why: noTracking
        ? '진행 기록 파일이 아예 없어 git 활동만으로 판단 중'
        : nearDone
          ? `미완료 ${c.open_checkboxes}건뿐 — 완료가 가까워 보임`
          : `진행 기록은 있으나 형제마다 형식이 달라 단계를 못 읽음 (미완료 ${c.open_checkboxes ?? 0}건)`,
    });
  }

  rows.sort((a, b) => a.priority - b.priority);
  return rows;
}

/**
 * 판정에 그림자를 얹는다 — coarse 를 사람이 준 정보로 대체.
 * @returns {Map<string, object>}
 */
export function mergeShadow(graph, snapshot) {
  const out = new Map();
  for (const p of graph.projects) {
    const sh = readShadow(p.id);
    if (!sh) continue;
    const s = snapshot.projects.find((x) => x.project_id === p.id);

    // 형제 쪽 기록이 그림자보다 나중에 바뀌었으면 낡았을 수 있다고 알린다
    const cpDate = s?.coarse?.checkpoint_mtime ?? null;
    const stale = Boolean(cpDate && sh.recorded_at && cpDate > sh.recorded_at);

    out.set(p.id, { ...sh, stale });
  }
  return out;
}

/** CLI */
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const argv = process.argv.slice(2);
  const graph = loadGraphOrExit(); // M15

  const flag = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : null;
  };
  const positional = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));

  const target = positional[0] ?? null;
  const last = flag('last');
  const next = flag('next');

  // 기록 모드
  if (target && last && next) {
    const p = graph.projects.find((x) => x.id === target || x.name_ko === target);
    if (!p) {
      console.log(`"${target}" 형제를 찾을 수 없습니다.`);
      process.exit(0);
    }
    try {
      const written = writeShadow(p.id, { last, next });
      console.log(`기록 완료: ${written}`);
      console.log(`  ${p.name_ko} 는 다음 스캔부터 거친 판정에서 벗어납니다.`);
    } catch (err) {
      console.log(`기록하지 못했습니다 — ${err.message}`);
    }
    process.exit(0);
  }

  // 목록 모드
  const { snapshot } = scanAll(graph);
  const rows = listNeedShadow(graph, snapshot);
  const stamp = String(snapshot.scanned_at).slice(11, 16);

  if (rows.length === 0) {
    console.log(`거친 판정인 형제가 없습니다.   [${stamp} 기준]`);
    process.exit(0);
  }

  console.log(`거친 판정인 형제 ${rows.length}곳   [${stamp} 기준]\n`);
  const todo = rows.filter((r) => !r.recorded);

  for (const r of rows) {
    console.log(`  ${r.recorded ? '✅' : '🟡'} ${r.name_ko}`);
    console.log(`     ${r.recorded ? '이미 정리됨' : r.why}`);
  }

  if (todo.length > 0) {
    const first = todo.slice(0, 2);
    console.log(`\n🔴 한 번에 다 하지 마세요. 먼저 이 ${first.length}곳만 권합니다:`);
    for (const r of first) console.log(`     · ${r.name_ko} — ${r.why}`);
    console.log('\n  각 형제마다 두 가지만 알려주시면 됩니다:');
    console.log('     1. 마지막으로 끝낸 게 무엇인가요?');
    console.log('     2. 다음에 할 일은 무엇인가요?');
    console.log('\n  (건너뛰어도 됩니다 — 거친 판정 상태와 그 이유가 계속 표시될 뿐입니다)');
  }
}
