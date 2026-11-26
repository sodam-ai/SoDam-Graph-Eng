/**
 * duplicate-candidates-test.mjs — 같은 저장소 폴더가 여러 개일 때, 어느 폴더들인지 알려 주는지 확인
 *
 * 배경(2026-11-27 실측): 형제 하나의 폴더가 4개(git worktree 3 + 원본)라 lost 가 됐는데,
 * 화면은 "경로 유실 — config.search_roots 와 markers 를 확인하세요"라고만 했다(원인과 다름).
 * 02 §resolve 절차: "여러 후보가 동시에 일치하면 lost 로 처리하고 **후보 목록을 표시**한다".
 *
 * 지켜야 하는 것: 폴더들을 보여 준다 · 고르지 않는다 · AI 가 지우지 말라고 말한다 ·
 *                 형제가 읽는 공유 발행(6필드)에는 후보가 섞이지 않는다 · 중복이 아닌 유실은 예전 안내 그대로
 *
 * 안전: 전부 임시 폴더의 가짜 저장소로 실행합니다. 실제 형제 폴더·홈은 읽거나 쓰지 않습니다.
 * 실행: node tools/duplicate-candidates-test.mjs   (성공 0 / 실패 1)
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AGENTIC = 'sodam-agentic-eng';
const REVERSE = 'sodam-reverse-eng'; // 폴더를 안 만들어 "그냥 유실" 대조군으로 씀

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
}

// GIT_DIR 같은 상속 변수가 있으면 -C 만으로는 임시 폴더에 갇히지 않는다
for (const k of Object.keys(process.env)) if (/^GIT_/i.test(k)) delete process.env[k];

const work = mkdtempSync(join(tmpdir(), 'sodam-graph-dup-'));
try {
  const home = join(work, 'home');
  const plugin = join(work, 'plugin');
  const repos = join(work, 'repos');
  mkdirSync(home, { recursive: true });
  for (const d of ['lib', 'data']) {
    cpSync(join(REPO, d), join(plugin, d), {
      recursive: true,
      filter: (src) => !/[\\/]data[\\/](snapshot\.json|\.lock|shadow)$/.test(src),
    });
  }
  const graph = JSON.parse(readFileSync(join(plugin, 'data', 'graph.json'), 'utf8'));
  const proj = (id) => graph.projects.find((p) => p.id === id);
  const makeRepo = (folder, remote) => {
    const dir = join(repos, folder);
    mkdirSync(dir, { recursive: true });
    execFileSync('git', ['-C', dir, 'init', '-q']);
    execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', `https://github.com/${remote}.git`]);
    return dir;
  };
  const DUPES = ['t_SoDam-Agentic-Eng', 't_SoDam-Agentic-Eng_wt-a', 't_SoDam-Agentic-Eng_wt-b'];
  for (const p of graph.projects) {
    if (p.id === REVERSE) continue;
    if (p.id === AGENTIC) for (const f of DUPES) makeRepo(f, p.repo_remote);
    else makeRepo(`t_SoDam-${p.id}-Eng`, p.repo_remote);
  }

  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.SODAM_GRAPH_SEARCH_ROOTS;
  delete env.SODAM_GRAPH_DEBUG;
  delete env.NODE_OPTIONS;
  delete env.NODE_V8_COVERAGE;
  env.SODAM_GRAPH_ROOT = repos; // 탐색은 가짜 저장소 안에서만 (S-13.7)

  const run = (script, ...args) => {
    const r = spawnSync(process.execPath, [join(plugin, 'lib', script), ...args], { cwd: home, env, encoding: 'utf8', timeout: 180_000 });
    if (r.status !== 0) throw new Error(`${script} exit=${r.status} ${r.stderr}`);
    return r.stdout;
  };
  const allDupes = (text) => DUPES.every((f) => new RegExp(`${f}(?![\\w-])`).test(text));
  const caution = (text) => text.includes('지우거나 옮기지 않습니다') && text.includes('직접 확인');

  // ── /graph-where ──
  const where = run('resolve.mjs', proj(AGENTIC).name_ko);
  check('W1 /graph-where 가 겹친 폴더 3개를 모두 보여 준다', allDupes(where), where);
  check('W2 임의로 고르지 않았다고 말한다', where.includes('3개') && where.includes('고르지 않'), where);
  check('W3 AI 는 지우지 않으며 직접 확인하라고 말한다', caution(where), where);
  check('W4 설정 문제라고 안내하지 않는다', !where.includes('search_roots 를 확인'), where);
  check('W5 하나를 저장소 루트로 고르지 않는다', !where.includes('저장소 루트 :'), where);

  const whereGone = run('resolve.mjs', proj(REVERSE).name_ko);
  check('W6 중복이 아닌 그냥 유실은 예전 안내 그대로', whereGone.includes('search_roots 를 확인') && !whereGone.includes('고르지 않'), whereGone);

  // ── /graph-next ──
  const next = run('judge.mjs');
  const mine = next.split(/\r?\n/).filter((l) => l.includes('t_SoDam-Agentic') || l.includes('같은 형제로 보이는'));
  check('N1 /graph-next 가 겹친 폴더들을 보여 준다', allDupes(next), next.slice(0, 900));
  check('N2 /graph-next 도 지우지 말라는 주의를 함께 말한다', caution(next), mine.join(' | ').slice(0, 300));
  check('N3 그냥 유실인 형제의 설정 확인 안내는 남아 있다', next.includes('search_roots'), next.slice(0, 600));

  // ── 형제가 읽는 공유 발행 (S-6 6필드) ──
  const published = readFileSync(join(home, '.sodam', 'graph-state.json'), 'utf8');
  const state = JSON.parse(published);
  const row = state.projects.find((p) => p.id === AGENTIC);
  check('S1 공유 발행은 6필드 그대로', Object.keys(row).sort().join(',') === 'id,name_ko,repo_root,resolve_status,scanned_at,state', Object.keys(row).join(','));
  check('S2 공유 발행에 겹친 폴더 경로가 섞이지 않는다', !published.includes('t_SoDam-Agentic') && row.repo_root === null && row.resolve_status === 'lost');

  // ── 명령 안내문 ──
  for (const [label, file] of [['C1', 'graph-where.md'], ['C2', 'graph-next.md']]) {
    const doc = readFileSync(join(REPO, 'commands', file), 'utf8');
    check(`${label} ${file} 안내가 겹친 폴더를 AI 가 지우거나 옮기지 말라고 한다`, doc.includes('겹친') && /지우거나 옮기지 마/.test(doc));
  }
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
