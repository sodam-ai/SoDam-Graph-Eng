/**
 * resolve.mjs — 형제가 "지금 어디 있는지" 찾아낸다
 *
 * 규격: 02_DATA_MODEL.md §resolve 절차
 *   1. repo_remote (정규화 후 비교)  → found_by_remote
 *   2. markers (OR — 하나라도 일치)  → found_by_marker
 *   3. 둘 다 실패                    → lost  (옛 경로를 조용히 재사용하지 않는다)
 *   +  markers 가 위험 경로면        → rejected_path (08 S-2.2)
 *
 * 🔴 이 파일이 프로젝트의 존재 이유입니다.
 *   경로를 정본에 저장하지 않고 **매번 다시 찾기** 때문에 폴더를 개명해도 안 깨집니다.
 *
 * 보안:
 *   S-2.1 모든 경로 path.resolve() 정규화     S-2.2 저장소 하위 검증
 *   S-2.4 심볼릭 링크 미추적 (lstat 판별)      S-2.5 / S-5.5 파일 5MB 상한
 *   S-5.1 깊이 4                              S-5.2 디렉터리 500개
 *   S-3 ①겹: **이 파일은 쓰기 API 를 import 하지 않는다** (읽기 API 만)
 */

import { readdirSync, lstatSync, readFileSync, existsSync } from 'node:fs';
import { resolve as resolvePath, join, sep } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { remoteUrl, normalizeRemote } from './gitSafe.mjs';
import { loadGraph, LIMITS } from './loadGraph.mjs';

/** `*SoDam-*-Eng*` 같은 단순 와일드카드를 정규식으로 */
function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

/** 경로가 base 하위인지 (S-2.2) */
function isInside(target, base) {
  const t = resolvePath(target);
  const b = resolvePath(base);
  return t === b || t.startsWith(b.endsWith(sep) ? b : b + sep);
}

/**
 * search_roots 아래에서 git 저장소 루트 후보를 모은다.
 *
 * 🔴 깊이 1(프로젝트 폴더)에만 scan_filter 를 적용하고, 그 아래로는 자유롭게 내려갑니다.
 *    **소담루프엔지니어링은 저장소가 한 겹 안쪽(`sodamloop/`)** 이라 이렇게 하지 않으면
 *    영영 못 찾습니다 — 이 프로젝트가 풀려는 통증 ① 그 자체입니다.
 */
export function collectCandidates(searchRoots, { filter = null, limits = LIMITS } = {}) {
  const found = [];
  const stats = { dirsVisited: 0, capped: false, skippedLinks: 0 };
  const filterRe = filter ? globToRegExp(filter) : null;

  for (const root of searchRoots) {
    const base = resolvePath(root);
    if (!existsSync(base)) continue;

    const stack = [[base, 0]]; // [dir, depth]
    while (stack.length > 0) {
      if (stats.dirsVisited >= limits.MAX_DIRS) {
        stats.capped = true; // S-5.2
        break;
      }
      const [dir, depth] = stack.pop();
      if (depth > limits.MAX_DEPTH) continue; // S-5.1

      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue; // 권한 없음 등 — 못 찾으면 상위에서 lost 로 드러난다
      }
      stats.dirsVisited += 1;

      // 이 디렉터리가 git 저장소 루트인가
      if (entries.some((e) => e.name === '.git')) {
        found.push(resolvePath(dir));
        continue; // 저장소 안쪽은 더 내려가지 않는다 (중첩 저장소 탐색 방지)
      }

      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (e.name === 'node_modules') continue;

        const child = join(dir, e.name);

        // S-2.4: 심볼릭 링크는 따라가지 않는다 (순환 참조 무한 탐색 방지)
        try {
          if (lstatSync(child).isSymbolicLink()) {
            stats.skippedLinks += 1;
            continue;
          }
        } catch {
          continue;
        }

        // 깊이 1 에서만 1차 필터 적용 (02 §성능 예산)
        if (depth === 0 && filterRe && !filterRe.test(e.name)) continue;

        stack.push([child, depth + 1]);
      }
    }
  }
  return { candidates: found, stats };
}

/** markers OR 판정 — 하나라도 일치하면 true (02 §resolve 절차 2) */
function matchesMarkers(repoRoot, markers, limits) {
  for (const m of markers) {
    if (m.unsafe) continue; // S-2.3 에서 걸러진 항목
    const target = resolvePath(repoRoot, m.file);

    // S-2.2: 정규화 결과가 저장소 밖을 가리키면 거부
    if (!isInside(target, repoRoot)) continue;

    try {
      const st = lstatSync(target); // S-2.4: 링크는 읽지 않는다
      if (st.isSymbolicLink() || !st.isFile()) continue;
      if (st.size > limits.MAX_FILE_BYTES) continue; // S-2.5 / S-5.5
      if (readFileSync(target, 'utf8').includes(m.contains)) return true;
    } catch {
      /* 없거나 못 읽으면 다음 marker */
    }
  }
  return false;
}

/** 설치된 플러그인 캐시 경로 (02 §plugin_cache_path — 2026-08-02 실측 확정 3겹 구조) */
export function findPluginCache(pluginName) {
  const roots = [
    process.env.CLAUDE_CONFIG_DIR ? resolvePath(process.env.CLAUDE_CONFIG_DIR) : null,
    resolvePath(homedir(), '.claude'),
  ].filter(Boolean);

  for (const root of roots) {
    const cache = resolvePath(root, 'plugins', 'cache');
    if (!existsSync(cache)) continue;
    let markets;
    try {
      markets = readdirSync(cache, { withFileTypes: true }).filter((e) => e.isDirectory());
    } catch {
      continue;
    }
    for (const mk of markets) {
      const pdir = resolvePath(cache, mk.name, pluginName);
      if (!existsSync(pdir)) continue;
      try {
        const versions = readdirSync(pdir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort();
        if (versions.length > 0) return resolvePath(pdir, versions[versions.length - 1]);
      } catch {
        /* 무시 */
      }
      return pdir;
    }
  }
  return null;
}

/** `sodam-loop-eng` → `sodam-loop` (플러그인 이름 규칙 — 형제 6/6 실측) */
function pluginNameOf(projectId) {
  return projectId.replace(/-eng$/, '');
}

/**
 * 7형제를 전부 찾는다.
 * @returns {{results: Array, stats: object, candidateCount: number}}
 */
export function resolveAll(graph = loadGraph()) {
  const cfg = graph.config;
  const limits = LIMITS;

  let { candidates, stats } = collectCandidates(cfg.search_roots, {
    filter: cfg.scan_filter,
    limits,
  });

  const remoteOf = new Map();
  const remoteFor = (r) => {
    if (!remoteOf.has(r)) {
      const url = remoteUrl(r);
      remoteOf.set(r, url ? normalizeRemote(url) : null);
    }
    return remoteOf.get(r);
  };

  const resolveOne = (p) => {
    // S-2.3: 쓸 수 있는 marker 가 하나도 없으면 명시적으로 거부
    if (p.markers.every((m) => m.unsafe)) {
      return { resolve_status: 'rejected_path', repo_root: null };
    }

    const wanted = normalizeRemote(p.repo_remote);

    // 1순위 — repo_remote
    const byRemote = candidates.filter((r) => remoteFor(r) === wanted);
    if (byRemote.length === 1) return { resolve_status: 'found_by_remote', repo_root: byRemote[0] };
    if (byRemote.length > 1) {
      // 잘못 찾는 것이 못 찾는 것보다 위험하다 (02 §resolve 절차 2)
      return { resolve_status: 'lost', repo_root: null, ambiguous: byRemote };
    }

    // 2순위 — markers (OR)
    const byMarker = candidates.filter((r) => matchesMarkers(r, p.markers, limits));
    if (byMarker.length === 1) return { resolve_status: 'found_by_marker', repo_root: byMarker[0] };
    if (byMarker.length > 1) {
      return { resolve_status: 'lost', repo_root: null, ambiguous: byMarker };
    }

    return { resolve_status: 'lost', repo_root: null };
  };

  let results = graph.projects.map((p) => ({ id: p.id, ...resolveOne(p) }));

  // 1차 필터가 다 못 찾았으면 전수 스캔 (02 §성능 예산)
  if (results.some((r) => r.resolve_status === 'lost')) {
    const full = collectCandidates(cfg.search_roots, { filter: null, limits });
    candidates = full.candidates;
    stats = { ...full.stats, fullScan: true };
    remoteOf.clear();
    results = graph.projects.map((p) => ({ id: p.id, ...resolveOne(p) }));
  }

  // 파생 경로 채우기 (02 §Project (B) 파생)
  for (const r of results) {
    if (!r.repo_root) continue;
    r.folder_path = r.repo_root;
    r.prd_path = existsSync(resolvePath(r.repo_root, '.PRD')) ? '.PRD' : null;
    r.checkpoint_path = existsSync(resolvePath(r.repo_root, 'CHECKPOINT.md'))
      ? 'CHECKPOINT.md'
      : null;
    const cache = findPluginCache(pluginNameOf(r.id));
    r.plugin_cache_path = cache;
    r.installed = Boolean(cache);
  }

  return { results, stats, candidateCount: candidates.length };
}

/** 이 모듈이 직접 실행됐는가 (Windows 의 `file:///D:/...` 형식까지 정확히 비교) */
export function isMain(metaUrl) {
  try {
    return process.argv[1] ? pathToFileURL(process.argv[1]).href === metaUrl : false;
  } catch {
    return false;
  }
}

/** CLI: node lib/resolve.mjs */
if (isMain(import.meta.url)) {
  const graph = loadGraph();
  const { results, stats, candidateCount } = resolveAll(graph);
  const nameOf = new Map(graph.projects.map((p) => [p.id, p.name_ko]));
  console.log(
    `후보 저장소 ${candidateCount}개 · 디렉터리 ${stats.dirsVisited}개 방문` +
      (stats.capped ? ' (상한 도달)' : '') +
      (stats.fullScan ? ' · 전수 스캔' : ' · 1차 필터') +
      (stats.skippedLinks ? ` · 링크 ${stats.skippedLinks}개 건너뜀` : '')
  );
  for (const r of results) {
    console.log(
      `  ${r.resolve_status.padEnd(16)} ${(nameOf.get(r.id) ?? r.id).padEnd(22)} ${r.repo_root ?? '-'}`
    );
  }
}
