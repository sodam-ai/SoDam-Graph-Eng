#!/usr/bin/env bash
# verify-prd.sh — .PRD/ 문서 자기검증 (M-V) 실행 스크립트
#
# 규격: 03_PHASES.md §M-V — 이 스크립트는 그 문서에 박혀 있던 bash 블록(A·B·D·E)을
# 그대로 옮긴 것입니다(검사 로직 변경 없음). 매번 문서에서 복붙하지 않도록
# 실행파일로 추출했을 뿐입니다 — 2026-09-11 PRD↔코드 대조 감사에서 두 차례 수동
# 실행한 것과 완전히 같은 내용입니다.
#
# 읽기 전용 — .PRD/*.md 만 grep 합니다. 형제 저장소·data/graph.json·코드는
# 건드리지 않습니다.
#
# 사용법: ./tools/verify-prd.sh   (또는 bash tools/verify-prd.sh, 어디서 실행해도 됨)
# 종료 코드: 0 = A·B·D 전부 통과 / 1 = 하나라도 실패 (E는 자동 판정 불가 — 출력을 눈으로 대조)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRD_DIR="$SCRIPT_DIR/../.PRD"
cd "$PRD_DIR" || { echo "PRD 폴더를 찾을 수 없습니다: $PRD_DIR"; exit 2; }

FAIL_COUNT=0

echo "=== A-1) 금지어 검사 (FAIL — 0건이어야 함) ==="
SELF='^03_PHASES\.md:[0-9]+:(#|grep|SELF|FAIL|WARN|ALLOW|\s|\|)'
ALLOW='개정|초안|폐기|해소|~~|실패 원인|잔재|쓰지 마|안 됩니다'
FAIL='state="미상"|"미상"으로|미상 0개|미상 — 이유|sodam-ai/sodam-graph-eng|sodam-ai/sodam-loop[^-]|5줄 이내|SODAM_ROOT'
WARN='미상'

A1=$(grep -rnE "$FAIL" *.md | grep -Ev "$SELF" | grep -Ev "$ALLOW")
if [ -n "$A1" ]; then
  echo "$A1"
  echo "❌ FAIL — 위 항목이 0건이어야 합니다"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  echo "✅ PASS (0건)"
fi

echo ""
echo "=== A-2) 경고어 검사 (WARN — 건수만 확인, 정당한 용법이 섞임) ==="
WARN_COUNT=$(grep -rnE "$WARN" *.md | grep -Ev "$SELF" | grep -Ev "$ALLOW" | wc -l)
echo "  ${WARN_COUNT}건 (자동 FAIL 아님 — 직접 훑어 정당한 용법인지만 확인)"

echo ""
echo "=== B) 구조 검사 ==="
B1=$(grep -c "^### 전제 조건" 03_PHASES.md)
echo "  전제 조건 절 개수: $B1 (3이어야 함)"
if [ "$B1" != "3" ]; then
  echo "  ❌ FAIL"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

B2=$(grep -oh "M[0-9]\+ —" 03_PHASES.md | sort -V | uniq -d)
if [ -n "$B2" ]; then
  echo "  ❌ FAIL — 중복 마일스톤 번호: $B2"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  echo "  ✅ 중복 마일스톤 번호 없음"
fi

B3=$(grep -oh "](\./[0-9A-Za-z_]*\.md)" *.md | sed 's/](\.\///;s/)//' | sort -u | while read -r t; do [ -f "$t" ] || echo "깨짐: $t"; done)
if [ -n "$B3" ]; then
  echo "  ❌ FAIL — 링크 깨짐:"
  echo "$B3"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  echo "  ✅ 내부 링크 전부 유효"
fi

echo ""
echo "=== D) 구현 가능성 SPEC 검사 (신규 규격은 이 목록에 한 줄만 추가할 것) ==="
SPEC=(
  "graph.json 최상위 구조::02_DATA_MODEL.md::\"projects\""
  "Mermaid 타입 고정::03_PHASES.md::graph LR"
  "픽스처 생성 스크립트::04_PROJECT_SPEC.md::make-fixture"
  "픽스처 remote 등록법::04_PROJECT_SPEC.md::git remote add"
  "~/.sodam 디렉터리 생성::02_DATA_MODEL.md::mkdirSync"
  "정체 축 필드::02_DATA_MODEL.md::days_in_state"
  "markers OR 판정::02_DATA_MODEL.md::OR (하나라도"
  "설치 캐시 판정::02_DATA_MODEL.md::installed"
  "마켓플레이스 매니페스트::04_PROJECT_SPEC.md::marketplace.json"
  "훅 등록 파일::04_PROJECT_SPEC.md::hooks.json"
  "플러그인 루트 변수::04_PROJECT_SPEC.md::CLAUDE_PLUGIN_ROOT"
  "설치 명령 결합형식::04_PROJECT_SPEC.md::sodam-graph@sodamgraph-marketplace"
  "GitHub 설치 실측 항목::03_PHASES.md::GitHub 마켓플레이스 설치 실측"
  "PUBLIC 전환 노출 목록::09_LEGAL_LICENSE_SPEC.md::E-2"
  "skills 의도적 제외::04_PROJECT_SPEC.md::의도적으로 만들지 않습니다"
  "발행 시점 명문화::02_DATA_MODEL.md::발행 시점"
  "발행 배선 수용기준::02_DATA_MODEL.md::P-2"
  "1.5층 추출 필드::02_DATA_MODEL.md::open_items"
  "1.5층 수용기준::02_DATA_MODEL.md::L-1"
  "읽는 쪽 계약::07_FAMILY_COEXIST.md::규약 F"
  "읽는 쪽 조각::07_FAMILY_COEXIST.md::readFamilyState"
  "착수 기준선 파일::03_PHASES.md::baseline-2026-08-02.json"
  "배선 보수 마일스톤::03_PHASES.md::M-W"
)
for s in "${SPEC[@]}"; do
  desc="${s%%::*}"
  rest="${s#*::}"
  file="${rest%%::*}"
  pat="${rest#*::}"
  if grep -qF "$pat" "$file" 2>/dev/null; then
    echo "  ✅ PASS  $desc"
  else
    echo "  ❌ FAIL  $desc — $file 에 '$pat' 없음"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

echo ""
echo "=== E) 건수 일관성 검사 (자동 판정 불가 — 아래 출력을 눈으로 대조할 것) ==="
echo "[미결 건수]";       grep -rhoE "미결[^0-9]{0,12}[0-9]+건|남은 것 \([0-9]+건" *.md | sort | uniq -c
echo "[가정 원장]";       grep -rhoE "가정 원장[^0-9]{0,10}[0-9]+건|§8\][^0-9]{0,10}[0-9]+건" *.md | sort | uniq -c
echo "[형제 불일치]";     grep -rhoE "불일치[^0-9]{0,10}[0-9]+건" *.md | sort | uniq -c
echo "[계약 갱신안]";     grep -rhoE "갱신안[^0-9]{0,10}[0-9]+건" *.md | sort | uniq -c
echo "[사람 결정 대기]";  grep -rhoE "사람 결정 대기[^0-9]{0,10}[0-9]+건" *.md | sort | uniq -c

echo ""
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "=== 종합: PASS — A·B·D 전부 통과 (E는 위 출력을 직접 대조하십시오) ==="
  exit 0
else
  echo "=== 종합: FAIL — ${FAIL_COUNT}건 실패 (위 ❌ 표시 참조) ==="
  exit 1
fi
