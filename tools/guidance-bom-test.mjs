/**
 * guidance-bom-test.mjs — 명령 안내문 · /graph-why 2위 표시 · BOM 회귀 테스트
 *
 * 배경(2026-11-26, 독립 검증 지적을 원본에서 재확인):
 *   · commands/graph-map.md 가 AI 에게 "/graph-shadow 로 정리하면 (추정)이 사라진다",
 *     "노드 안 숫자 = 그 단계에 머문 날수"라고 전달하게 했다 — 코드와 다르다.
 *   · /graph-why 는 2위가 coarse 여도 아무 표시 없이 날수를 점수식에 썼다.
 *   · 파일 맨 앞 BOM(일부 편집기가 넣음)이 있으면 그림자 기록이 null 이 되고,
 *     형제 CHECKPOINT.md 첫 줄의 체크박스가 빠졌다.
 *
 * 안전: lib·data 를 임시 폴더에 복사해 합성 스캔값으로만 실행한다. 형제 저장소는 읽지 않는다.
 * 실행: node tools/guidance-bom-test.mjs   (성공 0 / 실패 1)
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
}

const work = mkdtempSync(join(tmpdir(), 'sodam-graph-guide-'));
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
env.SODAM_GRAPH_ROOT = join(work, 'repos'); // 혹시 다시 스캔해도 실제 형제 폴더는 안 읽는다 (S-13.7)
delete env.SODAM_GRAPH_SEARCH_ROOTS;
delete env.SODAM_GRAPH_DEBUG;

const graph = JSON.parse(readFileSync(join(plugin, 'data', 'graph.json'), 'utf8'));
const pad = (n) => String(n).padStart(2, '0');

/** 형제별 정체 일수를 정해 합성 스냅샷을 쓰고 /graph-why 출력을 돌려준다 */
function why(daysById) {
  const n = new Date();
  const scanned_at =
    `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}` +
    `T${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
  const projects = graph.projects.map((p) => {
    const open = graph.milestones
      .filter((m) => m.project_id === p.id && m.state !== 'done')
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0];
    return {
      project_id: p.id,
      name_ko: p.name_ko,
      repo_root: join(work, 'repos', p.id),
      resolve_status: 'found_by_remote',
      state: open?.state ?? null,
      milestone_id: open?.id ?? null,
      days_in_state: daysById[p.id] ?? 1,
      days_since_activity: 0,
      git_last_commit_date: null,
      git_dirty_count: 0,
      tracking_files: [],
      coarse: null,
      mismatch: [],
    };
  });
  writeFileSync(join(plugin, 'data', 'snapshot.json'), JSON.stringify({ scanned_at, projects }));
  const r = spawnSync(process.execPath, [join(plugin, 'lib', 'critical.mjs')], {
    cwd: home,
    env,
    encoding: 'utf8',
    timeout: 120_000,
  });
  if (r.status !== 0) throw new Error(`critical.mjs 비정상 종료 exit=${r.status} ${r.error ?? ''} ${r.stderr}`);
  return r.stdout.split(/\r?\n/);
}
const secondLine = (lines) => lines.find((l) => l.trim().startsWith('2위')) ?? '';

try {
  // ── 명령 안내문 (AI 가 사용자에게 전하는 말) ──
  const mapDoc = readFileSync(join(REPO, 'commands', 'graph-map.md'), 'utf8');
  const whyDoc = readFileSync(join(REPO, 'commands', 'graph-why.md'), 'utf8');
  check('G1 graph-map 안내가 "정리하면 (추정)이 사라진다"고 시키지 않는다', !/정리하면[^\n]{0,20}사라(짐|집니다|져요)/.test(mapDoc));
  check(
    'G2 graph-map 안내가 coarse 날수의 한계와 "마지막 활동"을 설명한다',
    mapDoc.includes('실제로 멈췄는지는 알 수 없') && mapDoc.includes('마지막 활동')
  );
  check('G3 graph-why 안내가 "단계 추적 안 됨"을 그대로 전하게 한다', whyDoc.includes('단계 추적 안 됨'));

  // ── /graph-why 2위 줄 ──
  const a = why({ 'sodam-loop-eng': 97, 'sodam-prompt-eng': 122, 'sodam-graph-eng': 10 });
  check('W1 2위가 coarse 면 2위 줄에도 "단계 추적 안 됨"', secondLine(a).includes('소담프롬프트') && secondLine(a).includes('단계 추적 안 됨'), secondLine(a));
  check('W2 2위 점수식은 그대로 (122 × (1+0) × 0.7 = 85.4)', secondLine(a).includes('122 × (1+0) × 0.7 = 85.4'), secondLine(a));
  const b = why({ 'sodam-loop-eng': 97, 'sodam-graph-eng': 116 });
  check('W3 2위가 추적되는 상태면 그 표시를 안 붙인다', secondLine(b).includes('소담그래프') && !secondLine(b).includes('단계 추적 안 됨'), secondLine(b));

  // ── BOM ──
  const lib = (f) => import(pathToFileURL(join(plugin, 'lib', f)).href);
  const { readShadow } = await lib('shadow.mjs');
  const { extractLayer1 } = await lib('scan.mjs');
  const md = '---\nproject_id: x\nsource: user_input\nrecorded_at: 2026-01-01\n---\n\n## 할 일\n- state: todo\n';
  mkdirSync(join(plugin, 'data', 'shadow'), { recursive: true });
  const shadow = (text) => {
    writeFileSync(join(plugin, 'data', 'shadow', 'x.md'), text, 'utf8');
    return JSON.stringify(readShadow('x'));
  };
  const plain = shadow(md);
  check('B0 전제: BOM 없는 그림자는 읽힌다', plain?.includes('"title":"할 일"'), plain);
  check('B1 BOM 있는 그림자 = 없는 것과 같은 결과', shadow(`﻿${md}`) === plain);
  check('B2 BOM + CRLF 도 같은 결과', shadow(`﻿${md.replace(/\n/g, '\r\n')}`) === plain);

  const sib = join(work, 'sibling');
  mkdirSync(sib, { recursive: true });
  writeFileSync(join(sib, 'CHECKPOINT.md'), '﻿- [ ] 첫 번째 남은 일\n- [ ] 두 번째 남은 일\n', 'utf8');
  const got = extractLayer1(sib);
  check('B3 BOM 있는 CHECKPOINT 의 첫 줄 항목도 센다', got.open_checkboxes === 2 && got.open_items[0] === '첫 번째 남은 일', JSON.stringify(got));
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
