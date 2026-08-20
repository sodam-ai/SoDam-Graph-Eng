/**
 * verify.mjs — M12: done_when 자동 검증 (verify_cmd 실행)
 *
 * 규격: 03_PHASES.md M12 ("verify_cmd 를 실제로 돌려 verified 를 기계가 판정")
 *
 * 🔴 안전 경계 — 왜 형제 마일스톤은 절대 실행하지 않는가:
 *   S-1(명령어 주입 차단)의 원래 위협 모델은 "형제 저장소·git 값처럼 신뢰 못 할
 *   외부 데이터"였다. verify_cmd 는 그래프 저장소 스스로가 자기 정본(graph.json)에
 *   직접 적어둔 값이라 그 위협 모델 밖에 있지만, 앞으로 형제 마일스톤에도 이
 *   필드가 채워질 가능성을 대비해 project_id 검사를 **데이터 우연이 아니라
 *   코드로 강제**한다 — 이 검사가 없으면 형제 쪽 데이터가 채워지는 순간
 *   조용히 임의 명령 실행 구멍이 열린다.
 *
 * 🔴 셸을 쓰지 않는다(S-1.1) — verify_cmd 는 배열이어야 하며, execFileSync 에
 *   인자 배열로만 전달한다. 문자열 전체를 셸에 넘기는 방식은 여기서 영구 금지.
 */

import { execFileSync } from 'node:child_process';
import { REPO_ROOT } from './safeWrite.mjs';

const SELF_PROJECT_ID = 'sodam-graph-eng';
/** 이미 실행 중인 것으로 알려진 바이너리만 — 화이트리스트 (S-1 정신의 방어 한 겹 더) */
const ALLOWED_BINS = new Set(['node', 'gh']);
// M12 신설 — 08_SECURITY_SPEC.md 는 git 전용 5초(S-5.4)만 규정, verify_cmd 는 별도 값이 필요.
// 🔴 2026-08-20 실측: node 자식 프로세스 안에서 또 node 자식(git 여러 번 호출하는
// scan.mjs 등)을 실행하면 직접 실행보다 5배 가까이 느려짐(직접 1.4초 → 중첩 실행
// 6.9~10.5초, 시스템 부하에 따라 변동). 10초는 위험해 20초로 넉넉히 잡음.
const VERIFY_TIMEOUT_MS = 20_000;
const VERIFY_MAX_BUFFER = 1024 * 1024; // 1MB — gitSafe.mjs 와 동일 정책

/** 이 마일스톤이 자동 검증 대상인가 */
export function canVerify(milestone) {
  return (
    milestone?.project_id === SELF_PROJECT_ID &&
    Array.isArray(milestone.verify_cmd) &&
    milestone.verify_cmd.length > 0 &&
    milestone.verify_cmd.every((t) => typeof t === 'string')
  );
}

/**
 * verify_cmd 를 실제로 실행한다. 실행 시간은 코드로 직접 재므로 명령 문자열에
 * `time` 같은 셸 키워드가 필요 없다.
 * @returns {{ok:true, elapsedMs:number, output:string} | {ok:false, elapsedMs:number, reason:string}}
 */
export function runVerifyCmd(milestone) {
  if (!canVerify(milestone)) {
    return { ok: false, elapsedMs: 0, reason: '자동 검증 대상이 아닙니다(자기 소유·배열형 verify_cmd 필수)' };
  }
  const [bin, ...args] = milestone.verify_cmd;
  if (!ALLOWED_BINS.has(bin)) {
    return { ok: false, elapsedMs: 0, reason: `허용되지 않은 실행 파일 "${bin}" (허용: ${[...ALLOWED_BINS].join('·')})` };
  }
  const startedAt = Date.now();
  try {
    const output = execFileSync(bin, args, {
      cwd: REPO_ROOT,
      timeout: VERIFY_TIMEOUT_MS,
      maxBuffer: VERIFY_MAX_BUFFER,
      encoding: 'utf8',
      windowsHide: true,
    });
    return { ok: true, elapsedMs: Date.now() - startedAt, output: output.trim() };
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    if (err?.killed || err?.signal === 'SIGTERM') {
      return { ok: false, elapsedMs, reason: `타임아웃(${VERIFY_TIMEOUT_MS}ms 초과)` };
    }
    return { ok: false, elapsedMs, reason: err?.message ?? '실행 실패' };
  }
}
