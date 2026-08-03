/**
 * lock.mjs — data/.lock 파일 잠금 (M11 · 06_ANTI_STALL_SPEC.md §3-B 규약 D5)
 *
 * 왜 필요한가: M11 은 처음으로 graph.json(정본)에 씁니다. 두 세션이 동시에
 * 승격을 시도하면 정본이 깨질 수 있습니다(06 §3-B 가 실측한 동시 세션 환경).
 *
 * 🔴 Windows 대비 — stale lock 자동 해제 필수:
 *   프로세스가 크래시하면 lock 파일만 남아 **영구 데드락**이 됩니다.
 *   그래서 lock 안에 PID + 시각을 적어두고, ① PID 가 이미 죽었거나
 *   ② STALE_MS 를 넘겼으면 오래된 lock으로 간주해 강제로 걷어냅니다.
 */

import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { REPO_ROOT } from './safeWrite.mjs';

const LOCK_PATH = resolvePath(REPO_ROOT, 'data', '.lock');
const STALE_MS = 30_000; // 30초 — 정상 승격 작업은 이보다 훨씬 빨리 끝난다
const RETRY_MS = 50;

/** 이 PID 가 살아있는가 (Windows 포함 — signal 0 은 실제로 죽이지 않고 존재만 확인) */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 기존 lock 이 낡았는가 (죽은 프로세스 또는 STALE_MS 초과) */
function isStaleLock() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
  } catch {
    return true; // 손상된 lock 파일은 낡은 것으로 간주하고 걷어냄
  }
  if (typeof raw.pid !== 'number' || typeof raw.at !== 'number') return true;
  if (!isAlive(raw.pid)) return true;
  if (Date.now() - raw.at > STALE_MS) return true;
  return false;
}

/**
 * lock 을 획득한다 (배타적 생성 — `wx` 플래그로 원자적).
 * @param {number} timeoutMs 총 대기 시간
 * @returns {boolean} 획득 성공 여부
 */
export function acquireLock(timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      // 'wx' — 이미 있으면 EEXIST 로 실패 (원자적 배타 생성, S-1 무관 — 파일시스템 API)
      writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: 'wx' });
      return true;
    } catch (err) {
      if (err?.code !== 'EEXIST') return false; // 예상 못한 실패 — 안전하게 포기
      if (existsSync(LOCK_PATH) && isStaleLock()) {
        try {
          unlinkSync(LOCK_PATH); // 죽은 세션이 남긴 lock — 걷어내고 재시도
        } catch {
          /* 다른 프로세스가 먼저 걷어냈을 수 있음 — 무시하고 재시도 */
        }
        continue;
      }
      if (Date.now() >= deadline) return false; // 다른 살아있는 세션이 쓰는 중 — 포기
      // 짧게 대기 후 재시도 (동기 대기 — Node 에 sleep 이 없어 busy-wait, 상한 3초라 무해)
      const until = Date.now() + RETRY_MS;
      while (Date.now() < until) {
        /* busy-wait */
      }
    }
  }
}

/** lock 을 놓는다. 자기 lock 이 아니면(다른 프로세스 소유) 건드리지 않는다. */
export function releaseLock() {
  try {
    const raw = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
    if (raw.pid === process.pid) unlinkSync(LOCK_PATH);
  } catch {
    /* 이미 없거나 손상 — 무시 (누군가 이미 정리함) */
  }
}

/**
 * lock 을 잡고 fn 을 실행한 뒤 반드시 놓는다.
 * @returns {{ok:true, value:*} | {ok:false, reason:string}}
 */
export function withLock(fn, timeoutMs = 3000) {
  if (!acquireLock(timeoutMs)) {
    return { ok: false, reason: '다른 세션이 정본을 쓰는 중입니다 — 잠시 후 다시 시도하세요' };
  }
  try {
    return { ok: true, value: fn() };
  } finally {
    releaseLock();
  }
}
