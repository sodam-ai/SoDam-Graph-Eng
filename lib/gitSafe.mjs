/**
 * gitSafe.mjs — git 실행 래퍼 (읽기 전용)
 *
 * 규격: 08_SECURITY_SPEC.md
 *   S-1 명령어 주입 차단 — 셸을 절대 경유하지 않는다
 *   S-3 ③겹 읽기 전용 불변식 — 읽기 서브커맨드 화이트리스트만 허용
 *   S-5.4 자원 한계 — 타임아웃 5초 · 출력 상한 1MB
 *
 * 이 파일이 이 프로젝트에서 git 을 실행하는 유일한 통로입니다.
 * 다른 모듈이 child_process 를 직접 부르면 S-1 방어가 무너집니다.
 */

import { execFileSync } from 'node:child_process';
import { LIMITS } from './loadGraph.mjs';

/** S-3 ③겹: 읽기 전용 서브커맨드만. 여기 없는 것은 throw. */
const ALLOWED_SUBCOMMANDS = new Set([
  'status',
  'log',
  'remote',
  'rev-parse',
  'cat-file',
  'ls-files',
]);

/** S-5.4 — 정본은 loadGraph.mjs의 LIMITS 하나뿐(2026-08-20 중복 정의 제거) */
const GIT_TIMEOUT_MS = LIMITS.GIT_TIMEOUT_MS;
const GIT_MAX_BUFFER = 1024 * 1024; // 1MB

/**
 * git 을 읽기 전용으로 실행한다.
 *
 * @param {string} repoRoot   저장소 루트 (절대 경로). `-C` 로 분리 전달한다(S-1.3)
 * @param {string[]} args     [서브커맨드, ...인자]. 문자열 결합 금지 — 배열만 받는다
 * @returns {{ok: true, stdout: string} | {ok: false, reason: string}}
 *
 * 실패를 예외로 던지지 않고 결과 객체로 돌려주는 이유:
 * 형제 저장소는 언제든 사라지거나 다른 세션이 잠글 수 있습니다(06 §3-B 실측).
 * 한 형제의 실패가 나머지 6형제 판정을 막으면 안 됩니다.
 * 단, "쓰면 안 되는 것을 쓰려 한" 경우(화이트리스트 위반)는 설계 위반이므로 throw 합니다.
 */
export function gitRead(repoRoot, args) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error('gitSafe: args 는 비어 있지 않은 배열이어야 합니다');
  }

  const sub = args[0];
  if (!ALLOWED_SUBCOMMANDS.has(sub)) {
    // S-3 ③겹 — add·commit·checkout·clean·reset·push 등은 여기서 막힙니다.
    throw new Error(
      `gitSafe: 허용되지 않은 git 서브커맨드 "${sub}". ` +
        `읽기 전용만 가능합니다 (${[...ALLOWED_SUBCOMMANDS].join('·')})`
    );
  }

  if (typeof repoRoot !== 'string' || repoRoot.length === 0) {
    throw new Error('gitSafe: repoRoot 가 필요합니다');
  }

  try {
    const stdout = execFileSync(
      'git',
      // S-1.3: 경로를 문자열로 붙이지 않고 -C 다음 인자로 분리 전달
      ['-C', repoRoot, ...args],
      {
        // S-1.1 / S-1.2: shell 옵션을 주지 않는다. execFileSync 는 기본이 셸 미경유.
        encoding: 'utf8',
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      }
    );
    return { ok: true, stdout };
  } catch (err) {
    // S-13.4: 스택 트레이스를 그대로 올리지 않고 한 줄 사유만 돌려준다
    const reason =
      err && err.code === 'ETIMEDOUT'
        ? `git 타임아웃 (${GIT_TIMEOUT_MS}ms 초과)`
        : err && err.code === 'ENOBUFS'
          ? 'git 출력이 상한(1MB)을 넘음'
          : 'git 실행 실패';
    return { ok: false, reason };
  }
}

/** 이 경로가 git 저장소의 루트인지 확인하고, 맞으면 정규화된 루트를 돌려준다. */
export function repoRootOf(dir) {
  const r = gitRead(dir, ['rev-parse', '--show-toplevel']);
  if (!r.ok) return null;
  const root = r.stdout.trim();
  return root.length > 0 ? root : null;
}

/** origin 원격 주소. 없으면 null (markers 폴백으로 넘어감). */
export function remoteUrl(repoRoot) {
  const r = gitRead(repoRoot, ['remote', 'get-url', 'origin']);
  if (!r.ok) return null;
  const url = r.stdout.trim();
  return url.length > 0 ? url : null;
}

/**
 * remote URL 정규화 — 02_DATA_MODEL.md §정규화 규칙
 *   1) 호스트·프로토콜 제거  2) 뒤의 .git 제거  3) 뒤의 / 제거  4) 소문자화
 * 결과는 `owner/repo` 형태의 **비교용 임시값**이며 graph.json 에 저장하지 않습니다.
 */
export function normalizeRemote(url) {
  if (typeof url !== 'string') return null;
  let s = url.trim();
  if (s.length === 0) return null;

  s = s.replace(/^ssh:\/\/git@[^/]+\//i, '');
  s = s.replace(/^https?:\/\/[^/]+\//i, '');
  s = s.replace(/^git@[^:]+:/i, '');
  s = s.replace(/\.git$/i, '');
  s = s.replace(/\/+$/, '');

  return s.toLowerCase();
}

/** 커밋 날짜(YYYY-MM-DD)와 제목. 제목은 호출부에서 반드시 마스킹합니다(S-4.4). */
export function lastCommit(repoRoot) {
  const r = gitRead(repoRoot, ['log', '-1', '--format=%ad%x00%s', '--date=short']);
  if (!r.ok) return null;
  const [date, subject] = r.stdout.trim().split('\0');
  if (!date) return null;
  return { date, subject: subject ?? '' };
}

/** 미커밋 파일 수. 파일 이름은 돌려주지 않습니다(S-4.2 — 이름 자체가 정보). */
export function dirtyCount(repoRoot) {
  const r = gitRead(repoRoot, ['status', '--porcelain']);
  if (!r.ok) return null;
  const lines = r.stdout.split('\n').filter((l) => l.trim().length > 0);
  return lines.length;
}

/** 커밋 해시가 실재하는지 (06 §1 증거 E2). */
export function commitExists(repoRoot, hash) {
  if (!/^[0-9a-f]{7,40}$/i.test(hash)) return false;
  const r = gitRead(repoRoot, ['cat-file', '-e', `${hash}^{commit}`]);
  return r.ok;
}

export const _internal = { ALLOWED_SUBCOMMANDS, GIT_TIMEOUT_MS, GIT_MAX_BUFFER };
