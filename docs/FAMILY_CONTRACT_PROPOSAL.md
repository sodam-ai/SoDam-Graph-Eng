# 소담그래프엔지니어링 — 형제 계약 갱신안 (M8-A ①)

> **이 문서는 소담그래프엔지니어링이 형제 저장소에 제출하는 패치입니다.**
> 소담그래프엔지니어링은 **형제 저장소 파일을 한 글자도 고치지 않았습니다** — 아래 내용을 **사람이 직접 복사해서** 각 대상 파일에 붙여넣고, **push는 사용자가 직접** 합니다 (읽기 전용 결정 불변).
>
> 근거 문서: `.PRD/07_FAMILY_COEXIST.md` §9 · `.PRD/03_PHASES.md` M8-A
> 작성일: 2026-08-03

---

## 갱신 대상 8건 요약

| # | 대상 파일 | 무엇을 추가하나 |
|---|----------|---------------|
| 1 | `SoDam-Agentic-Eng/docs/family-synergy.md` §1 표 | 7번째 행 (소담그래프엔지니어링) |
| 2 | 같은 문서 §1 한 줄 원칙 | "…위치와 진행은 Graph" |
| 3 | 같은 문서 §3 | 규약 E (SessionStart 출력 예산) 신설 |
| 4 | 같은 문서 §4 공유 인터페이스 표 | `graph-state.json` 행 + 규약 F 8항 + 붙여넣기 조각 + `isFamilyAlive` 구현 |
| 5 | 같은 문서 §2 설치 순서 | 독립 트랙으로 병렬 추가 |
| 6 | `SoDam-Harness-Eng/.PRD/SODAM_FAMILY_COEXIST.md` §1 | 7번째 행 |
| 7 | `26y_06m_31d_SoDam_Family` 우산 저장소 문서 | 6팀 → 7팀 갱신 |
| 8 | 정본 §5 (설치 표준) | GitHub 표준 선언 + 이름 형식 통일 + M0 실측 결과 |

---

## ① `family-synergy.md` §1 — 역할 분담 표에 7번째 행 추가

**대상 파일**: `SoDam-Agentic-Eng/docs/family-synergy.md`
**대상 위치**: `## 1. 6형제 역할 분담` 표 마지막 행 뒤

붙여넣을 행:

```markdown
| 🗺 **SoDamGraph** | 7형제 위치·진행단계·의존관계 판정 (읽기 전용) | 다른 형제가 진행 판정 로직을 재구현 금지 |
```

> 표 제목도 "6형제 역할 분담" → **"7형제 역할 분담"**으로 바꿔야 합니다(문서 전체에서 "6형제"라는 표기가 여러 곳에 있으므로 §1 제목만이라도 우선 반영을 권합니다).

---

## ② `family-synergy.md` §1 — 한 줄 원칙 갱신

**대상 위치**: `**한 줄 원칙**:` 문장

**기존**:
```
안전은 Harness, 기억은 Context, 반복은 Loop, 입문은 Agentic·Prompt, 분석은 Reverse.
```

**갱신안**:
```
안전은 Harness, 기억은 Context, 반복은 Loop, 입문은 Agentic·Prompt, 분석은 Reverse, **위치와 진행은 Graph**.
```

---

## ③ `family-synergy.md` §3 — 규약 E (SessionStart 출력 예산) 신설

**대상 위치**: `## 3. 훅 충돌 방지 규약` 안, 규약 D 다음

**왜 필요한가**: 정본 §3에는 PreToolUse·Stop·PostToolUse 규약(A~D)만 있고 SessionStart 규약이 없습니다. 2026-08-02 실측상 **6형제 전부 SessionStart hook 0개** — 소담그래프엔지니어링이 최초 사용자입니다. 지금 계약을 안 만들면 8·9번째 형제가 같은 자리에서 충돌합니다.

붙여넣을 절:

```markdown
### 규약 E: SessionStart 출력 예산 (신설 — SoDamGraph 제안)

SessionStart도 PreToolUse 처럼 **병렬 실행**입니다. 형제 각자가 세션 시작마다 안내문을
출력하면 세션 시작이 안내문으로 뒤덮여 사용자가 전부 꺼버리고, 도구가 죽습니다.

| # | 규칙 | 값 |
|---|-----|-----|
| E1 | 형제 1개당 출력 | 3줄 이내 |
| E2 | 패밀리 전체 합계 상한 | 10줄 (초과 시 형제 간 재조정) |
| E3 | 끄는 법 제공 | 필수 (예: `SODAM_{PLUGIN}_SILENT=1`) |
| E4 | 침묵 조건 | 형제 저장소 밖에서 세션을 열면 아무것도 출력 안 함 |
| E5 | 성능 예산 | 1초 이내. 초과하면 캐시만 읽고 백그라운드 재스캔 |
| E6 | 실패 시 | 조용히 침묵 (세션 시작을 절대 막지 않음) |
```

---

## ④ `family-synergy.md` §4 — 공유 인터페이스 확장 (규약 F + 조각 + `isFamilyAlive`)

**대상 위치**: `## 4. 공유 인터페이스 (미래 계약)` 표

### 4-1. 표에 행 추가

```markdown
| `graph-state.json` (읽기) | Graph | 각 형제 위치·진행 조회 (`isFamilyAlive` 구현체) |
```

### 4-2. 규약 F 신설 — 표 아래에 다음 절 전체를 붙여넣기

```markdown
### 규약 F — 공유 상태 읽기 (형제 6곳 공통, SoDamGraph 제안)

| # | 규칙 | 값 |
|---|-----|-----|
| F1 | 경로 | `~/.sodam/graph-state.json` (`os.homedir()` 기준. 하드코딩 금지) |
| F2 | 쓰기 | **절대 금지**. 쓰는 쪽은 SoDamGraph 단독. 형제가 쓰면 정본이 깨짐 |
| F3 | 파일 없음 | 조용히 넘어간다 (Graph 미설치가 형제 동작을 막으면 안 됨) |
| F4 | 파싱 실패 | 조용히 넘어간다 (발행 도중 읽으면 반쪽일 수 있음) |
| F5 | 신선도 | `scanned_at` 이 1시간 초과면 "낡음"으로 간주 |
| F6 | 버전 | `version` 이 모르는 값이면 무시한다 |
| F7 | 필드 | `id`·`name_ko`·`repo_root`·`state`·`resolve_status`·`scanned_at` 6개뿐 |
| F8 | 용도 | 위치 조회·생존 확인까지. 이 파일로 파일을 고치거나 명령을 실행하지 않는다 |

**형제가 그대로 붙여 쓰는 조각 (의존성 0개):**

\`\`\`js
// ~/.sodam/graph-state.json 읽기 — 규약 F 준수 (SoDam-Graph-Eng 제공)
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function readFamilyState() {
  try {
    const s = JSON.parse(readFileSync(join(homedir(), '.sodam', 'graph-state.json'), 'utf8'));
    if (s.version !== 1) return null;                       // F6
    const ageMin = (Date.now() - new Date(s.scanned_at).getTime()) / 60000;
    return { projects: s.projects, stale: ageMin > 60, ageMin };  // F5
  } catch { return null; }                                   // F3·F4 — 조용히 넘어감
}
\`\`\`

**`isFamilyAlive(name)` 구현 — §4 표의 "공통 표준화 필요·미구현" 자리를 채웁니다:**

\`\`\`js
export function isFamilyAlive(id) {
  const p = readFamilyState()?.projects.find(x => x.id === id);
  return !!p && p.resolve_status.startsWith('found');   // 파일 존재가 아니라 remote 대조 결과
}
\`\`\`

> 정본 §3 규약 D가 경고한 "파일 존재만 확인하는 `isHarnessAlive()`의 fail-open"을,
> `repo_remote` 대조 결과를 넘겨받는 방식으로 구조적으로 줄입니다.
```

---

## ⑤ `family-synergy.md` §2 — 설치 순서에 독립 트랙 추가

**대상 위치**: `## 2. 설치 순서` 코드블록 아래 또는 옆

**갱신안**: 기존에 "SoDamPrompt ← 웹앱. 나머지와 독립 스택이라 순서 유연"이 있는 것과 같은 성격으로 추가:

```markdown
> **SoDamGraph** 도 독립 트랙입니다 — 형제 저장소를 읽기 전용으로만 훑고 다른 형제의
> 안전 토대(Harness 백업 등)에 의존하지 않습니다. 설치 순서 어디에 끼워도 무방합니다.
```

---

## ⑥ `SODAM_FAMILY_COEXIST.md` §1 — 역할 분담 표에 7번째 행

**대상 파일**: `SoDam-Harness-Eng/.PRD/SODAM_FAMILY_COEXIST.md`
**대상 위치**: `## 1. 역할 분담 (중복 금지)` 표 마지막 행 뒤

```markdown
| **Graph** | 7형제 위치·진행단계·의존관계 판정 (읽기 전용, `deny`/`ask` 판정 없음) | 형제는 진행 판정을 직접 내리지 않음 |
```

---

## ⑦ `SoDam_Family` 우산 저장소 — 6팀 → 7팀 갱신

**대상**: `26y_06m_31d_SoDam_Family` 저장소의 README(또는 팀 목록을 담은 최상위 문서)

**갱신 방향** (정확한 파일명은 그 저장소를 열어 직접 확인 필요 — 소담그래프엔지니어링은 다른 형제 저장소를 읽지 않으므로 이 부분만 사람이 확인):
- "6개 프로젝트" / "6팀" 표기를 **"7개 프로젝트" / "7팀"**으로
- 소담그래프엔지니어링 행 추가 — 역할: "7형제 위치·진행 판정 (읽기 전용)", 저장소: `sodam-ai/SoDam-Graph-Eng`

---

## ⑧ 정본 §5 — 설치 표준 갱신 (가장 값어치 있는 전달 사항)

**대상 파일**: `SoDam-Agentic-Eng/docs/family-synergy.md`
**대상 위치**: `## 5. 단일 마켓플레이스 요건` 절

**추가할 내용 3가지:**

```markdown
### 🆕 설치 표준 (2026-08-02 사용자 확정 — SoDamGraph 제안 반영)

① **설치는 GitHub 마켓플레이스를 표준으로 한다.** 7형제 전체를 GitHub 마켓플레이스 +
   플러그인 형태로 통일한다. 로컬 폴더 설치는 GitHub 방식이 실패할 때의 폴백이다.

② **마켓플레이스 이름 형식을 통일한다.** 현재 실측상 4갈래로 갈려 있다:

   | 형식 | 형제 |
   |------|------|
   | `{X}-marketplace` (붙여쓰기) | 하네스·컨텍스트·리버스 |
   | 플러그인 이름과 동일 | 에이전틱 |
   | `{x}-marketplace` (하이픈) | 프롬프트 |
   | `{x}-local` | 루프 |

   → 신규 형제(8번째~)는 `{x}-marketplace` (다수파, 3/6) 형식을 권장한다.

③ **🟢 실측 결과 — PRIVATE 저장소도 GitHub 마켓플레이스 설치가 됩니다.**
   소담그래프엔지니어링 M0 `done_when` 8번에서 실제로 검증했습니다:

   ```
   claude plugin marketplace add sodam-ai/SoDam-Graph-Eng
     → ✔ Successfully added marketplace: sodamgraph-marketplace
   claude plugin install sodam-graph@sodamgraph-marketplace
     → ✔ Successfully installed (scope: user) · Status: ✔ enabled
   ```

   인증된 계정(`gh auth`) 기준 HTTPS 클론으로 처리되며, SSH 미설정이어도 자동 폴백합니다.
   **공개 전환이 필요 없습니다** — 형제 6곳도 지금 그대로 GitHub 설치가 가능합니다.
   (패밀리 안에 이 명제를 두고 두 형제의 인식이 상충했었습니다 — 소담프롬프트엔지니어링
   README는 "가능하다"는 전제로 썼지만 그 저장소 자체는 PUBLIC이라 검증된 적이 없었고,
   소담하네스엔지니어링은 "공개 후에만 가능"이라고 반대로 썼습니다. 이번이 패밀리 최초
   검증입니다.)
```

---

## 작성자 각주

- 위 8건은 전부 **이미 실측·확정된 사실**만 담았습니다 — README 완성을 기다릴 필요 없이 지금 제출해도 안 어긋납니다 (`03_PHASES.md` 15차 순서변경 근거).
- 소담그래프엔지니어링은 **작성만** 했습니다. 형제 저장소에 push하는 것은 **사용자 몫**입니다 (읽기 전용 결정 불변).
- 함께 제출하는 문서: [`FAMILY_INCONSISTENCY_REPORT.md`](./FAMILY_INCONSISTENCY_REPORT.md) (불일치 7건).
