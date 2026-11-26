/**
 * shadow-crlf-test.mjs — Windows 줄바꿈(CRLF) 회귀 테스트
 *
 * 배경(2026-11-26 실측): 설치본의 data/shadow/*.md 는 CRLF 였고, readShadow 의
 * 머리말 정규식이 LF 만 알아서 **오류 없이** null 을 돌려줬다. 목록(listShadows)에는
 * 있는데 판정에서는 없는 것처럼 동작했다. 개발 저장소(LF)에서는 드러나지 않았다.
 *
 * 이 테스트가 지키는 것:
 *   · 같은 내용이면 LF 든 CRLF 든 readShadow 결과가 똑같다
 *   · CRLF 그림자도 판정에 반영된다 (kind = shadow)
 *   · 형제 CHECKPOINT.md 의 미완료 항목 추출은 CRLF 에서도 같다 (원래 안전 — 계속 지킨다)
 *
 * 안전: lib·data 를 임시 폴더에 복사해 그 복사본에만 쓴다. 형제 저장소는 읽지 않는다.
 * 실행: node tools/shadow-crlf-test.mjs   (성공 0 / 실패 1)
 */

import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ID = 'sodam-loop-eng';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
}

const work = mkdtempSync(join(tmpdir(), 'sodam-graph-crlf-'));
const plugin = join(work, 'plugin');
mkdirSync(plugin, { recursive: true });
for (const d of ['lib', 'data']) {
  cpSync(join(REPO, d), join(plugin, d), {
    recursive: true,
    filter: (src) => !/[\\/]data[\\/](snapshot\.json|\.lock|shadow)$/.test(src),
  });
}
const shadowDir = join(plugin, 'data', 'shadow');
mkdirSync(shadowDir, { recursive: true });

const LF = [
  '---',
  `project_id: ${ID}`,
  'source: user_input',
  'recorded_at: 2026-09-01',
  '---',
  '',
  '## 다음 할 일 제목',
  '- state: todo',
  '- done_when: 끝내고 기록',
  '- owner: human',
  '- evidence: (직전 완료) 이전 일',
  '',
  '> 사람이 직접 알려준 내용입니다.',
  '',
].join('\n');
const CRLF = LF.replace(/\n/g, '\r\n');
const write = (text) => writeFileSync(join(shadowDir, `${ID}.md`), text, 'utf8');

try {
  const lib = (f) => import(pathToFileURL(join(plugin, 'lib', f)).href);
  const { readShadow } = await lib('shadow.mjs');
  const { judgeProject } = await lib('judge.mjs');
  const { loadGraph } = await lib('loadGraph.mjs');
  const { extractOpenItems } = await lib('scan.mjs');

  write(LF);
  const fromLf = readShadow(ID);
  check('C0 전제: LF 그림자는 읽힌다', fromLf?.title === '다음 할 일 제목', JSON.stringify(fromLf));

  write(CRLF);
  const fromCrlf = readShadow(ID);
  check('C1 CRLF 그림자도 읽힌다', fromCrlf !== null, 'null');
  check(
    'C2 CRLF 결과가 LF 결과와 완전히 같다 (값에 \\r 이 안 남는다)',
    JSON.stringify(fromCrlf) === JSON.stringify(fromLf),
    JSON.stringify(fromCrlf)
  );

  const graph = loadGraph();
  const snapshot = {
    projects: [{ project_id: ID, repo_root: join(work, 'repo'), coarse: null, tracking_files: [] }],
  };
  const j = judgeProject(graph, snapshot, ID);
  check('C3 CRLF 그림자가 판정에 반영된다', j.kind === 'shadow' && j.text === '시작: 다음 할 일 제목', `${j.kind} / ${j.text}`);

  const md = ['# 기록', '- [ ] 첫 번째 남은 일', '```', '- [ ] 코드 블록 안', '```', '- [x] 끝난 일', '* [ ] 두 번째 남은 일'].join('\n');
  check(
    'C4 형제 CHECKPOINT 미완료 추출은 CRLF 에서도 같다',
    JSON.stringify(extractOpenItems(md.replace(/\n/g, '\r\n'))) === JSON.stringify(extractOpenItems(md)),
    JSON.stringify(extractOpenItems(md.replace(/\n/g, '\r\n')))
  );

  // 배포본에 기록이 하나도 없으면 data/shadow/ 폴더 자체가 없다 — 그래도 새 기록이 저장돼야 한다
  rmSync(shadowDir, { recursive: true, force: true });
  const { writeShadow, listShadows } = await lib('shadow.mjs');
  const before = listShadows().length;
  writeShadow(ID, { last: '이전 일', next: '새 할 일' });
  check(
    'C5 data/shadow/ 폴더가 없어도 목록은 비고, 새 기록은 저장·판독된다',
    before === 0 && readShadow(ID)?.title === '새 할 일',
    `before=${before} title=${readShadow(ID)?.title}`
  );
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
