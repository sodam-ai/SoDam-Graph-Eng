/**
 * rejected.mjs — data/rejected.json 승격 거부 이력 (M11 · 06_ANTI_STALL_SPEC.md §1)
 *
 * "거부 이력을 남겨 같은 항목을 다시 제안하지 않는다"는 규칙을 구현합니다.
 * git 추적 대상입니다 — 사람의 결정이라 잃어버리면 안 됩니다 (04_PROJECT_SPEC.md 구조도).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { localDate } from './scan.mjs';
import { safeWrite, REPO_ROOT } from './safeWrite.mjs';

export const REJECTED_PATH = resolvePath(REPO_ROOT, 'data', 'rejected.json');

/** 읽기 — 파일이 없거나 손상돼도 빈 목록으로 안전하게 시작 */
export function readRejected() {
  if (!existsSync(REJECTED_PATH)) return { version: 1, entries: [] };
  try {
    const r = JSON.parse(readFileSync(REJECTED_PATH, 'utf8'));
    if (!Array.isArray(r.entries)) return { version: 1, entries: [] };
    return r;
  } catch {
    return { version: 1, entries: [] };
  }
}

export function isRejected(milestoneId) {
  return readRejected().entries.some((e) => e.milestone_id === milestoneId);
}

/**
 * 거부 이력을 남긴다 — 06 §5 "남은 것" 결정 전까지는 **영구 제외**가 현재 방향입니다
 * (얼마 뒤 다시 제안할지는 2주 운영 후 재평가 대상, PRD 미결 사항).
 */
export function addRejected(milestoneId, reason = null) {
  const r = readRejected();
  if (!r.entries.some((e) => e.milestone_id === milestoneId)) {
    r.entries.push({ milestone_id: milestoneId, rejected_at: localDate(new Date()), reason });
    safeWrite(REJECTED_PATH, `${JSON.stringify(r, null, 2)}\n`);
  }
  return r;
}
