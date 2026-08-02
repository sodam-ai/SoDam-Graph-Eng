#!/usr/bin/env bash
# make-fixture.sh — _test_fixture/ 더미 저장소 생성
#
# 규격: 04_PROJECT_SPEC.md §_test_fixture 만드는 법
#
# 🔴 이 스크립트는 _test_fixture/ 밖에는 아무것도 쓰지 않습니다 (08 S-13.8).
#    실제 형제 폴더는 절대 건드리지 않습니다 — 다른 세션이 동시 작업 중일 수 있습니다.
#
# 🟢 실제 GitHub 저장소를 만들 필요가 없습니다.
#    `git remote add` 만으로 `git remote get-url origin` 이 값을 돌려주므로
#    resolve 로직이 그대로 시험됩니다.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FX="$ROOT/_test_fixture"

# ── 안전 가드 (S-13.8): 지우는 대상이 _test_fixture 하위인지 확인 ──────────
case "$FX" in
  */_test_fixture) : ;;
  *) echo "중단: 픽스처 경로가 _test_fixture 가 아닙니다 — $FX" >&2; exit 1 ;;
esac
rm -rf "$FX"
mkdir -p "$FX"

mkrepo() { # $1=폴더명  $2=remote(없으면 빈칸)  $3=plugin.json name
  local d="$FX/$1"
  mkdir -p "$d/.claude-plugin"
  git -C "$d" init -q 2>/dev/null || (cd "$d" && git init -q)
  git -C "$d" config user.email "fixture@example.invalid"
  git -C "$d" config user.name "fixture"
  git -C "$d" config commit.gpgsign false
  [ -n "$2" ] && git -C "$d" remote add origin "$2"
  printf '{"name":"%s"}\n' "$3" > "$d/.claude-plugin/plugin.json"
  git -C "$d" add -A
  git -C "$d" commit -q -m "fixture" 2>/dev/null
}

echo "픽스처 생성 위치: $FX"

# ① repo_a — resolve 1순위(repo_remote) + 개명 내성 테스트
mkrepo "repo_a" "https://github.com/sodam-ai/SoDam-Fixture-A.git" "sodam-fixture-a"
echo "  [1] repo_a           remote O · markers O   → found_by_remote · 개명 내성"

# ② repo_b — remote 없음 → markers 폴백
mkrepo "repo_b" "" "sodam-fixture-b"
echo "  [2] repo_b           remote X · markers O   → found_by_marker"

# ③ 명령어 주입 (S-1) — 폴더명에 셸 확장 구문
INJ='test$(echo INJECTED)'
mkrepo "$INJ" "https://github.com/sodam-ai/SoDam-Fixture-Inject.git" "sodam-fixture-inject"
echo "  [3] $INJ  → 셸 경유 시 INJECTED 가 출력됨 (S-1)"

# ④ 옵션 오인 (S-1.4) — `-` 로 시작하는 폴더명
mkrepo "-dash-start" "https://github.com/sodam-ai/SoDam-Fixture-Dash.git" "sodam-fixture-dash"
echo "  [4] -dash-start      → git이 옵션으로 오해하는지 (S-1.4)"

# ⑤ 시크릿 (S-4) — .env 와 시크릿형 커밋 제목
SEC="$FX/repo_secret"
mkrepo "repo_secret" "https://github.com/sodam-ai/SoDam-Fixture-Secret.git" "sodam-fixture-secret"
printf 'API_KEY=this-is-a-synthetic-dummy-not-real\n' > "$SEC/.env"
printf 'dummy\n' > "$SEC/server.key"
git -C "$SEC" add -A
# 합성 더미 토큰 — 실제 값이 아닙니다 (09 L-6.3)
git -C "$SEC" commit -q -m "chore: rotate ghp_0000000000000000000000000000000000 token"
echo "  [5] repo_secret      .env · *.key · 커밋제목에 합성 더미 토큰 (S-4)"

# ⑥ 거대 파일 (S-2.5 / S-5.5) — 5MB 상한 확인용 6MB
BIG="$FX/repo_big"
mkrepo "repo_big" "https://github.com/sodam-ai/SoDam-Fixture-Big.git" "sodam-fixture-big"
node -e 'require("fs").writeFileSync(process.argv[1], "x".repeat(6*1024*1024))' "$BIG/CHECKPOINT.md"
echo "  [6] repo_big         CHECKPOINT.md 6MB      → 5MB 상한 (S-5.5)"

# ⑦ 깊은 트리 (S-5.1) — 깊이 4 상한 확인용 6단계
mkdir -p "$FX/deep/a/b/c/d/e"
mkrepo "deep/a/b/c/d/e/repo_deep" "https://github.com/sodam-ai/SoDam-Fixture-Deep.git" "sodam-fixture-deep" 2>/dev/null
echo "  [7] deep/a/b/c/d/e   깊이 6                 → 깊이 4 상한 (S-5.1)"

# ⑧ 심볼릭 링크 순환 (S-2.4) — Windows 에서는 권한이 없으면 생성 실패
if ln -s "$FX/repo_a" "$FX/loop_link" 2>/dev/null && [ -L "$FX/loop_link" ]; then
  ln -s "$FX/loop_link" "$FX/repo_a/back_link" 2>/dev/null
  echo "  [8] loop_link        심볼릭 링크 순환       → 무한 탐색 방지 (S-2.4)"
else
  rm -rf "$FX/loop_link" 2>/dev/null
  echo "  [8] (건너뜀)         심볼릭 링크 생성 불가 — Windows 권한/개발자 모드 필요"
  echo "                       → S-2.4 는 코드에 lstat 건너뛰기가 있는지로 확인합니다"
fi

echo
echo "완료. 총 $(find "$FX" -maxdepth 8 -name '.git' -type d 2>/dev/null | wc -l) 개 더미 저장소."
echo "정리하려면: rm -rf \"$FX\""
