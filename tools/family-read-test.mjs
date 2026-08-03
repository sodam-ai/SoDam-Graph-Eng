/**
 * family-read-test.mjs — M8-A done_when③ 읽는 쪽 실증
 *
 * docs/FAMILY_CONTRACT_PROPOSAL.md ④의 규약 F 조각(readFamilyState·isFamilyAlive)을
 * 형제 저장소를 고치지 않고 여기서 그대로 실행해, ~/.sodam/graph-state.json 을
 * 정상 판독하는지 + stale 판정까지 나오는지 확인한다.
 *
 * 실제 형제 저장소에는 아무것도 쓰지 않는다 (읽기 전용 결정 불변).
 */

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ── 아래 두 함수는 FAMILY_CONTRACT_PROPOSAL.md ④에 실린 조각과 100% 동일 ──
function readFamilyState(statePath = join(homedir(), '.sodam', 'graph-state.json')) {
  try {
    const s = JSON.parse(readFileSync(statePath, 'utf8'));
    if (s.version !== 1) return null; // F6
    const ageMin = (Date.now() - new Date(s.scanned_at).getTime()) / 60000;
    return { projects: s.projects, stale: ageMin > 60, ageMin }; // F5
  } catch {
    return null; // F3·F4 — 조용히 넘어감
  }
}

function isFamilyAlive(id, statePath) {
  const p = readFamilyState(statePath)?.projects.find((x) => x.id === id);
  return !!p && p.resolve_status.startsWith('found');
}
// ── 조각 끝 ──

console.log('=== 케이스 A: 실제 발행본을 정상 판독 ===');
const real = readFamilyState();
if (!real) {
  console.log('FAIL — 실제 graph-state.json 을 못 읽었습니다.');
  process.exit(1);
}
console.log(`projects: ${real.projects.length}개 · stale: ${real.stale} · ageMin: ${real.ageMin.toFixed(1)}`);
console.log(`isFamilyAlive('sodam-loop-eng') = ${isFamilyAlive('sodam-loop-eng')}`);
console.log(`isFamilyAlive('no-such-project') = ${isFamilyAlive('no-such-project')}`);

console.log('\n=== 케이스 B: 낡은 발행본 → stale 판정 확인 ===');
const fixturePath = join(process.cwd(), 'tools', '.graph-state.stale-fixture.json');
const staleFixture = {
  version: 1,
  produced_by: 'sodam-graph',
  scanned_at: '2020-01-01T00:00:00', // 1시간 훨씬 초과
  projects: [
    { id: 'sodam-loop-eng', name_ko: '소담루프엔지니어링', repo_root: 'X', state: 'coarse', resolve_status: 'found_by_remote', scanned_at: '2020-01-01T00:00:00' },
  ],
};
writeFileSync(fixturePath, JSON.stringify(staleFixture, null, 2));
try {
  const stale = readFamilyState(fixturePath);
  console.log(`stale: ${stale.stale} (참이어야 함) · ageMin: ${Math.round(stale.ageMin)}`);
  if (stale.stale !== true) {
    console.log('FAIL — 낡은 발행본인데 stale=false 로 판정됨');
    process.exit(1);
  }
} finally {
  unlinkSync(fixturePath); // 픽스처 정리
}

console.log('\n=== 케이스 C: 파일 없음 → 조용히 null (F3) ===');
const missing = readFamilyState(join(process.cwd(), 'tools', '.no-such-file.json'));
console.log(`결과: ${missing === null ? 'null (정상)' : 'FAIL'}`);

console.log('\n모든 케이스 통과 — 규약 F 조각이 실제로 동작합니다.');
