/**
 * safeWrite.mjs — 이 프로젝트에서 파일을 쓰는 **유일한 통로**
 *
 * 규격: 08_SECURITY_SPEC.md S-3 ②겹 (읽기 전용 불변식)
 *   "모든 파일 쓰기는 lib/safeWrite.mjs 한 곳을 통과.
 *    대상이 소담그래프엔지니어링 저장소 또는 ~/.sodam/graph-state.json 이
 *    아니면 throw"
 *
 * 🔴 왜 이렇게까지 하는가:
 *   형제 저장소에 쓰기가 발생하면 **사용자 결정 위반**이자 **다른 세션의 작업 파괴**입니다.
 *   2026-08-02 02:32~02:41 에 다른 세션이 형제를 동시 작업 중이었음이 실측됐습니다.
 *   "하지 마"라는 문서 규칙만으로는 부족해서 **코드 불변식**으로 만듭니다.
 */

import { writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

/** 이 저장소의 루트 (lib/ 의 부모) */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 공유 발행 위치 — 유일하게 저장소 밖에 쓰는 곳 (07 §5 발행 계약) */
export const SHARED_DIR = resolve(homedir(), '.sodam');
export const SHARED_STATE = resolve(SHARED_DIR, 'graph-state.json');

/** 경로가 base 하위인지 (경계 문자까지 확인 — `/foo-bar` 가 `/foo` 하위로 오인되지 않게) */
function isInside(target, base) {
  const t = resolve(target);
  const b = resolve(base);
  return t === b || t.startsWith(b.endsWith(sep) ? b : b + sep);
}

/**
 * 쓰기가 허용된 대상인지 판정한다.
 * 허용: ① 이 저장소 하위  ② ~/.sodam/graph-state.json (정확히 그 파일 하나)
 */
export function isWritable(target) {
  const t = resolve(target);
  if (t === SHARED_STATE) return true;
  return isInside(t, REPO_ROOT);
}

/** 허용 대상이 아니면 즉시 throw (명시적 실패 — 조용한 통과 없음) */
function assertWritable(target) {
  if (!isWritable(target)) {
    throw new Error(
      `safeWrite: 쓰기 금지 경로입니다 — ${resolve(target)}\n` +
        `  허용: ${REPO_ROOT} 하위 또는 ${SHARED_STATE}\n` +
        `  형제 저장소는 100% 읽기 전용입니다 (08 S-3).`
    );
  }
}

/**
 * 일반 쓰기.
 * @param {string} target 대상 경로
 * @param {string} content 내용 (UTF-8)
 */
export function safeWrite(target, content) {
  assertWritable(target);
  mkdirSync(dirname(resolve(target)), { recursive: true });
  writeFileSync(resolve(target), content, 'utf8');
  return resolve(target);
}

/**
 * 원자적 교체 쓰기 (temp → rename).
 *
 * 규격: 02_DATA_MODEL.md §발행 규격
 *   - 읽는 형제가 **반쪽 파일**을 보면 안 됨
 *   - temp 파일은 **같은 디렉터리**에 만든다 (다른 드라이브면 rename이 원자적이지 않음)
 *   - 🔴 대상 디렉터리가 없으면 **먼저 만든다** — 2026-08-02 실측상 `~/.sodam/` 은
 *     존재하지 않으므로 이 단계가 없으면 첫 발행이 곧바로 실패합니다.
 *     이미 있으면 건드리지 않습니다 (하네스 §6-4).
 */
export function safeWriteAtomic(target, content) {
  assertWritable(target);
  const dest = resolve(target);
  const dir = dirname(dest);

  mkdirSync(dir, { recursive: true }); // 있으면 no-op

  // 같은 디렉터리 안의 임시 파일 — 프로세스 ID로 충돌 회피 (동시 세션 대비)
  const tmp = resolve(dir, `.graph-state.${process.pid}.tmp`);
  try {
    writeFileSync(tmp, content, 'utf8');
    renameSync(tmp, dest); // 원자적 교체
  } catch (err) {
    // 실패해도 임시 파일을 남기지 않는다
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* 정리 실패는 무시 */
    }
    throw err;
  }
  return dest;
}

export const _internal = { isInside };
