# 소담그래프엔지니어링 (SoDam-Graph-Eng) — 데이터 모델

> 이 문서는 `graph.json` 안에 뭐가 들어가는지를 정의합니다.
> 개발자가 아니어도 이해할 수 있게 일상 용어로 씁니다.

---

## 저장 방식 (확정)

**파일뿐입니다.** 데이터베이스도, 서버도, 계정도 없습니다.

```
sodam-graph-eng/
└── data/
    ├── graph.json        # 정본 — 사람이 정한 것 (형제 목록, 단계, 관계)   [git 추적]
    ├── snapshot.json     # 실측 — 기계가 훑어서 기록한 캐시              [.gitignore]
    ├── rejected.json     # 승격 거부 이력                              [git 추적]
    ├── .lock             # 동시 세션 쓰기 잠금                          [.gitignore]
    └── shadow/           # 그림자 추적 (추적 파일 없는 형제)              [git 추적]
```

**정본과 실측을 분리하는 이유**: 사람이 정한 계획(`graph.json`)을 기계가 조용히 덮어쓰면, 어긋난 걸 아무도 모릅니다. 따로 두면 **"계획은 M4인데 실제 커밋은 M2에서 멈춤"** 같은 불일치가 눈에 보입니다.

---

### 🆕 공유 발행 — `~/.sodam/graph-state.json` (2026-08-02 신설)

**이게 없으면 "7형제 시너지"가 성립하지 않습니다.** 위 파일들은 전부 소담그래프엔지니어링 저장소 안에만 있어서, **다른 6형제가 지도를 못 읽습니다.** 혼자 보는 지도입니다.

```
data/graph.json  ──요약 발행──▶  ~/.sodam/graph-state.json
   (정본, 자기 저장소)              (6형제 누구나 읽기 전용)
```

**근거 — 형제 계약에 이미 있는 자리입니다:**

- 정본 `SoDam-Agentic-Eng/docs/family-synergy.md` **§4 공유 인터페이스** 표에 `isFamilyAlive(name)` 이 **"공통 표준화 필요 · 미구현"** 으로 등재돼 있습니다.
- `lib/resolve.mjs` 가 푸는 문제(**형제가 살아있고 어디 있는가**)가 정확히 그것입니다.
- 정본 §3 규약 D는 현재 `isHarnessAlive()` 가 *"파일 존재만 확인"* 해서 **껍데기에 위임하는 fail-open** 위험을 경고합니다. `repo_remote` 대조는 그 위험을 구조적으로 줄입니다.
- 공유 루트 `~/.sodam/` 은 이미 `loop-state.json` 이 쓰는 **기존 관례**입니다 (하네스 `SODAM_FAMILY_COEXIST.md` §3-3).

**발행 규격:**

| 항목 | 값 |
|------|---|
| 쓰는 쪽 | **소담그래프엔지니어링 단독** |
| 읽는 쪽 | 6형제 전부 (읽기 전용) |
| 내용 | 형제별 `id` · `name_ko` · `repo_root` · `state` · `resolve_status` · `scanned_at` **요약만** |
| 쓰기 방식 | **원자적 교체** (temp 파일 → rename) — 읽는 형제가 반쪽 파일을 보면 안 됨 |
| 실패 시 | **본체 기능은 정상 동작.** 발행은 부가 기능이라 실패해도 판정을 막지 않음 |
| 크기 상한 | 7형제 요약이라 **4KB 이내** |

**즉시 효과**: 소담루프엔지니어링이 Phase 2.5(실행 인계)를 기다리지 않고도 **지금 당장** 이 파일에서 "다음 할 일"을 읽어갈 수 있습니다.

> ⚠️ 가정 8 (개정): `graph.json` **정본**은 소담그래프엔지니어링 저장소 안에만 둡니다. 형제 저장소에는 아무 파일도 만들지 않습니다(읽기 전용 결정 불변).
> **공유 루트 `~/.sodam/` 에는 요약본 1개만** 발행합니다 — 형제 저장소가 아니라 계약된 공용 위치입니다.

---

## 🔴 `graph.json` 최상위 구조 (구현 시작점 — 이것부터 만드십시오)

> **왜 맨 앞에 있나**: 아래 엔티티 설명은 *조각*입니다. **파일을 어떻게 조립하는지**가 없으면 M1을 시작할 수 없고, 이 구조는 **한 번 정하면 되돌리기가 가장 비싼 결정**입니다(바꾸면 `resolve`·`scan`·`judge`·`critical` 전부 재작성).

### 채택: **평면형 + 전역 `config`**

```json
{
  "version": 1,
  "config": {
    "search_roots": ["D:\\AI_Dev_Work\\2026y"],
    "scan_filter": "*SoDam-*-Eng*",
    "stall_days": 7,
    "coarse_confidence": 0.7,
    "session_output_max_lines": 3,
    "session_budget_ms": 1000
  },
  "projects": [
    {
      "id": "sodam-loop-eng",
      "name_ko": "소담루프엔지니어링",
      "name_en": "SoDam-Loop-Eng",
      "repo_remote": "sodam-ai/SoDam-Loop-Eng",
      "markers": [
        { "file": ".claude-plugin/plugin.json", "contains": "sodam-loop" }
      ],
      "role": "다음 단계 실행·반복",
      "status": "paused"
    }
  ],
  "milestones": [
    {
      "id": "sodam-loop-eng.M4",
      "project_id": "sodam-loop-eng",
      "seq": 4,
      "title": "라이브 5종 실사용 검증",
      "state": "verified",
      "done_when": "실사용_테스트_가이드.md의 5종을 새 세션에서 전부 통과하고 결과를 기록",
      "verify_cmd": null,
      "evidence": "통합검증 15 PASS (커밋 31942fa)",
      "owner": "human",
      "last_moved_at": "2026-07-11"
    }
  ],
  "edges": [
    { "from": "sodam-loop-eng.M4", "to": "sodam-loop-eng.M5", "type": "next", "note": null },
    { "from": "sodam-graph-eng.M16", "to": "sodam-loop-eng.M4", "type": "depends_on",
      "note": "루프가 실행 담당으로 동작해야 Phase 2.5 착수 가능" }
  ],
  "blockers": [
    {
      "id": "blk-001",
      "milestone_id": "sodam-loop-eng.M4",
      "kind": "human_test",
      "description": "새 세션에서 실사용 테스트 5종 실행",
      "since": "2026-07-11"
    }
  ]
}
```

### 왜 평면형인가 (중첩형을 기각한 이유)

| | **평면형 (채택)** | 중첩형 (기각) |
|---|---|---|
| `Edge` 의 형제 간 관계 | **자연스러움** — `from`/`to` 가 어느 형제든 가리킴 | **꼬임** — `depends_on` 이 트리 밖을 가리켜야 함 |
| 그래프 DB 이전 | **1:1 대응** — `projects`+`milestones`=노드, `edges`=엣지 (§확장성과 일치) | 평탄화 작업 필요 |
| 순환 탐지 | `edges` 배열 하나만 순회 | 트리를 재귀로 뒤져야 함 |

### 🔴 `search_roots` 는 `config`(전역)입니다 — `Project` 안이 아닙니다

**초안은 `Project` 의 필수 필드였습니다.** 그런데:

- 7형제가 **전부 같은 값**이라 7번 중복됩니다
- `04_PROJECT_SPEC.md` 의 `SODAM_GRAPH_ROOT` 환경변수는 **전역 덮어쓰기**를 전제합니다
- `03_PHASES.md` M14가 *"`search_roots` 를 환경변수·설정 파일로 **분리**"* 를 Phase 2 과제로 잡고 있습니다

→ **지금 5분이면 되는 일이 Phase 2에서는 데이터 마이그레이션이 됩니다.** 처음부터 전역에 두면 **M14가 할 일이 없어져 Phase 2도 가벼워집니다.**

개별 형제가 다른 위치에 있으면 `Project` 에 `search_roots_override` 를 **선택 필드**로 추가합니다 (2026-08-02 기준 7형제 전부 불필요).

### `config` 값의 출처 — 규격 수치를 코드에 흩뿌리지 않습니다

| 키 | 값 | 출처 |
|---|---|---|
| `search_roots` | `D:\AI_Dev_Work\2026y` | 7형제 실측 위치 |
| `scan_filter` | `*SoDam-*-Eng*` | §성능 예산 — 60+ 폴더 전수 스캔 방지 |
| `stall_days` | `7` | 가정 11 (정체 판정 기준) |
| `coarse_confidence` | `0.7` | `06_ANTI_STALL_SPEC.md` §3 신뢰도 계수 |
| `session_output_max_lines` | `3` | `07_FAMILY_COEXIST.md` 규약 E1 |
| `session_budget_ms` | `1000` | `07_FAMILY_COEXIST.md` 규약 E5 |

> 2주 후 재평가에서 `coarse_confidence` 를 조정할 때 **파일 한 줄만** 고치면 됩니다. 코드에 박아두면 전부 뒤져야 합니다.

---

## 전체 구조

```
[Project 형제] ──1:N──> [Milestone 단계] ──1:N──> [Blocker 사람몫]
      │                        │
      │                        └──N:N──> [Edge 관계] (next / depends_on / shares / conflicts)
      │
      ├──1:N──> [Snapshot 실측기록]  (snapshot.json)
      ├──0:1──> [Shadow 그림자]      (shadow/<id>.md — 사람이 준 상세)
      └──0:N──> [Rejected 거부이력]   (rejected.json — 재제안 방지)

                     ↓ 요약 발행
            ~/.sodam/graph-state.json  → 6형제 읽기 전용
```

말로 풀면:

- **형제** 하나가 여러 개의 **단계**를 가진다
- **단계** 하나에 여러 개의 **사람 몫 블로커**가 붙을 수 있다
- **단계**끼리는 **관계**(다음 단계다 / 이게 먼저다 / 공유 / 충돌)로 이어진다
- **형제** 하나에 대해 훑을 때마다 **실측기록**이 하나씩 쌓인다
- 추적 파일이 부족한 형제는 **그림자**가 상세를 대신 담는다 (형제 저장소가 아니라 여기에)
- 승격을 거부한 항목은 **거부이력**에 남아 다시 제안되지 않는다
- 전체 요약은 **공유 발행**되어 6형제가 읽어간다

> **엔티티 5종**(`Project`·`Milestone`·`Edge`·`Blocker`·`Snapshot`)이 핵심이고, `Shadow`·`Rejected` 는 **보조 저장소**입니다. 그래프 DB로 옮길 때 노드가 되는 건 5종입니다.

---

## 엔티티 상세

### 1. Project (형제)

소담 7형제 각각. **경로 혼동 문제를 여기서 끝냅니다.**

**필드는 두 종류로 엄격히 나눕니다. 이 분리가 이 데이터 모델에서 가장 중요합니다.**

#### (A) 정본 — 사람이 정하고, 바뀌지 않는 값

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| `id` | 영문 식별자 (고정, 안 바뀜) | `sodam-loop-eng` | O |
| `name_ko` | 한글 정식 명칭 (축약 금지) | `소담루프엔지니어링` | O |
| `name_en` | 영문 정식 명칭 | `SoDam-Loop-Eng` | O |
| **`repo_remote`** | **1순위 식별 열쇠** — git 원격 주소 (**실측 표기 그대로**) | `sodam-ai/SoDam-Loop-Eng` | O |
| **`markers`** | **2순위 식별 열쇠** — 이 형제임을 증명하는 파일·문자열 | `[{"file":".claude-plugin/plugin.json","contains":"sodam-loop"}]` | O |
| `role` | 이 형제가 맡는 역할 한 줄 | `다음 단계 실행·반복` | O |
| `status` | 형제 전체 상태 | `active` / `paused` / `done` | O |
| `search_roots_override` | **이 형제만 다른 곳에 있을 때만** (보통 생략) | `["E:\\Other"]` | X |

> 🔴 **`search_roots` 는 `Project` 필드가 아니라 전역 `config` 입니다** (위 §최상위 구조). 7형제가 전부 같은 값이라 형제마다 넣으면 7번 중복되고, Phase 2 M14에서 어차피 전역으로 옮겨야 합니다.

#### (B) 파생 — 기계가 매번 다시 찾아내는 값 (`snapshot.json` 에 기록)

| 필드 | 설명 | 예시 |
|------|------|------|
| `folder_path` | 이번 스캔에서 찾은 폴더 | `D:\AI_Dev_Work\2026y\26y_06m_27d_SoDam-Loop-Eng` |
| `repo_root` | git 저장소의 진짜 루트 (folder_path와 다를 수 있음) | `...\26y_06m_27d_SoDam-Loop-Eng\sodamloop` |
| `prd_path` / `checkpoint_path` / `plugin_cache_path` | 발견된 문서·추적파일·플러그인 위치 | `.PRD` / `null` / `...\sodam-loop\0.1.0` |
| `resolve_status` | 찾기 결과 | `found_by_remote` / `found_by_marker` / **`lost`** / 🔒 **`rejected_path`** |

> 🔒 **`rejected_path`**: 정규화한 경로가 `search_roots` 하위가 아니거나 `markers[].file` 이 `..`·절대경로일 때 (`08_SECURITY_SPEC.md` S-2). **조용히 통과시키지 않고 명시적으로 거부**합니다.

---

#### 왜 경로를 정본에서 뺐는가 (반드시 지켜야 하는 이유)

**폴더 이름은 이 PC에서 자주 바뀝니다 — 확인된 사실입니다.**

| 프로젝트 | 개명 흔적 |
|---------|----------|
| StockCheck | 기록 `26y_08m_01d_` → **2026-08-02 실측 `26y_08m_02d_StockCheck`** (하루 만에 변경) |
| SoDam-Clip | `26y_07m_27d_` 로 폴더 개명됨 |
| SoDam-Design-Kit | `26y_07m_26d_` 로 폴더 개명됨 |
| TradePilot | `06d` → `07d` 개명 |

폴더명에 **날짜가 들어 있는데 그 날짜를 바꾸는 습관**이 있습니다. 경로를 정본에 박으면, **경로 혼동을 없애려고 만든 도구가 폴더 개명 한 번에 그 형제를 잃어버립니다.** 목적을 스스로 파괴하는 설계라 채택하지 않았습니다.

**형제를 찾는 순서 (resolve 절차):**

1. `search_roots` 아래를 훑어 각 git 저장소의 `remote get-url origin` 을 읽는다 → **정규화 후** `repo_remote` 와 일치하면 **확정** (`found_by_remote`)
2. 원격이 없거나 안 맞으면 `markers` 의 파일·문자열로 대조 → 일치하면 **확정** (`found_by_marker`)
3. 둘 다 실패 → **`lost`**. 옛 경로를 조용히 재사용하지 않고 **"경로 유실 — 재탐색 필요"** 라고 표시한다

> 3번이 핵심입니다. 못 찾았는데 찾은 척하는 것이 경로 혼동의 본질이기 때문입니다.

#### 🔴 remote URL 정규화 규칙 (필수 — 없으면 7형제 전원 매칭 실패)

**2026-08-02 실측한 형제들의 실제 remote:**

```
https://github.com/sodam-ai/SoDam-Harness-Eng.git
https://github.com/sodam-ai/SoDam-Context-Eng.git
https://github.com/sodam-ai/SoDam-Agentic-Eng.git
https://github.com/sodam-ai/SoDam-Loop-Eng.git      ← sodamloop/ 안
https://github.com/sodam-ai/SoDam-Prompt-Eng.git
https://github.com/sodam-ai/SoDam-Reverse-Eng.git
```

`git remote get-url origin` 이 돌려주는 값은 **형식이 여러 가지**입니다. 그대로 문자열 비교하면 실패합니다.

**정규화 절차 (비교 전 반드시 적용):**

| # | 처리 | 예 |
|---|-----|---|
| 1 | 앞의 호스트·프로토콜 제거 | `https://github.com/` · `git@github.com:` · `ssh://git@github.com/` → 제거 |
| 2 | 뒤의 `.git` 제거 | `SoDam-Loop-Eng.git` → `SoDam-Loop-Eng` |
| 3 | 뒤의 `/` 제거 | `sodam-ai/SoDam-Loop-Eng/` → `…-Eng` |
| 4 | **소문자로 변환 후 비교** | GitHub은 대소문자를 구분하지 않으므로 |

정규화 결과 = `owner/repo` 형태. 위 예는 전부 `sodam-ai/sodam-loop-eng` **(소문자 — 비교용 임시값)** 로 수렴합니다.

> ⚠️ **이 소문자 값은 `graph.json` 에 저장하지 않습니다.** 비교하는 순간에만 만드는 임시값입니다.
> `repo_remote` 필드에는 **항상 실측 표기 `sodam-ai/SoDam-Loop-Eng`** 를 적습니다.

> ⚠️ **정본에는 실제 표기(`sodam-ai/SoDam-Loop-Eng`)를 그대로 적고, 비교할 때만 소문자화**합니다. 정본을 소문자로 적으면 사람이 읽을 때 형제 이름을 못 알아봅니다.

**예시 (2026-08-02 실측값 그대로):**

```json
{
  "id": "sodam-loop-eng",
  "name_ko": "소담루프엔지니어링",
  "name_en": "SoDam-Loop-Eng",
  "repo_remote": "sodam-ai/SoDam-Loop-Eng",
  "markers": [
    { "file": ".claude-plugin/plugin.json", "contains": "sodam-loop" },
    { "file": "실사용_테스트_가이드.md", "contains": "SoDamLoop" }
  ],
  "role": "다음 단계 실행·반복",
  "status": "paused"
}
```

> `search_roots` 가 여기에 없는 게 정상입니다 — 전역 `config` 에 있습니다.

경로가 한 글자도 없습니다. 폴더를 `26y_09m_01d_SoDam-Loop-Eng` 로 바꾸셔도 다음 스캔에서 그대로 찾아냅니다.

> **markers 실측 확인**: 6형제 **전부** `.claude-plugin/plugin.json` 을 가지고 있습니다(2026-08-02). 2순위 식별 열쇠가 7/7 확보됐습니다.

#### `search_roots` 탐색 비용 제한 (성능 예산)

`D:\AI_Dev_Work\2026y` 아래에는 **60개 이상의 프로젝트 폴더**가 있습니다(실측). 전수 스캔은 세션 시작을 느리게 만듭니다.

| 규칙 | 값 |
|------|-----|
| 1차 필터 | 폴더명 패턴 `*SoDam-*-Eng*` 로 후보를 좁힌 뒤 git 명령 |
| 전수 스캔 | 1차 필터가 7형제를 다 못 찾았을 때만 |
| 세션 시작 예산 | **1초** — 초과 시 `snapshot.json` 캐시만 읽고 백그라운드 재스캔 (`07_FAMILY_COEXIST.md` 규약 E5) |

---

### 2. Milestone (단계)

각 형제의 진행 단계 하나. **"정체" 문제를 여기서 끝냅니다.**

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| `id` | 식별자 | `sodam-loop-eng.M4` | O |
| `project_id` | 어느 형제 것인지 | `sodam-loop-eng` | O |
| `seq` | 순서 번호 | `4` | O |
| `title` | 뭘 하는 단계인지 | `라이브 5종 실사용 검증` | O |
| `state` | 현재 상태 | `todo` / `doing` / `verified` / `blocked` / `done` / **`coarse`** / **`done_candidate`** | O |
| **`done_when`** | **뭘 보면 끝난 걸로 치는지 (사람이 읽는 문장)** | `실사용_테스트_가이드.md 5종 전부 새 세션에서 통과` | O |
| `verify_cmd` | 기계가 확인할 명령 (있으면) | `npm test` | X |
| `evidence` | 끝났다는 근거 | `커밋 31942fa · 15 PASS` | X |
| `owner` | 누가 하나 | `ai` / `human` / `both` | O |
| `last_moved_at` | 이 상태로 바뀐 날짜 | `2026-07-11` | O |

**`state` 7단계의 의미:**

| 상태 | 뜻 | 다음으로 가려면 |
|------|-----|--------------|
| **`coarse`** | **1층 추출만 됨** — 문서 요약은 있으나 마일스톤 상세 미상 | `/graph-shadow` 로 1회 정리하면 정상 상태로 |
| `todo` | 아직 시작 안 함 | 시작하면 `doing` |
| `doing` | 하는 중 | 만들기 끝나면 `verified` |
| **`verified`** | **만들었고 테스트도 통과함** | 증거가 모이면 **자동으로** `done_candidate` |
| **`done_candidate`** | **기계가 완료로 판단 — 사람 거부 대기** | 거부 없으면 다음 스캔에 `done` / `/graph-reject` 하면 `verified` 로 복귀 |
| `blocked` | 사람 몫 때문에 못 감 | 블로커 풀리면 원래 상태로 |
| `done` | 완전히 끝 | 다음 단계 `todo` 로. 되돌리려면 `/graph-undo` |

**상태 흐름:**

```
coarse ─(그림자 1회)─▶ todo ─▶ doing ─▶ verified ─(증거 2개)─▶ done_candidate ─(침묵)─▶ done
                                            ▲                        │                    │
                                            └───── /graph-reject ────┘                    │
                                            └──────────────── /graph-undo ────────────────┘
                          blocked ◀─(사람 몫 발생)─ 어느 상태에서든
```

> **`verified` 와 `done` 을 나눈 이유가 이 프로젝트의 핵심입니다.** 사용자가 말한 "이미 테스트/검증은 끝났는데 계속 그자리에 머문다" 가 정확히 **`verified` 에서 `done` 으로 못 넘어가는 상태**입니다. 지금은 이 둘이 구분이 안 되니 AI가 "끝났나?"를 판단하지 못하고 멈춥니다.

**예시:**

```json
{
  "id": "sodam-loop-eng.M4",
  "project_id": "sodam-loop-eng",
  "seq": 4,
  "title": "라이브 5종 실사용 검증",
  "state": "verified",
  "done_when": "실사용_테스트_가이드.md의 5종을 새 세션에서 전부 통과하고 결과를 기록",
  "verify_cmd": null,
  "evidence": "통합검증 15 PASS (커밋 31942fa)",
  "owner": "human",
  "last_moved_at": "2026-07-11"
}
```

---

#### Milestone 초기 데이터를 채우는 방법 (2026-08-02 **2차 개정 — 2층 추출**)

##### 🔴 왜 바꿨나 — 단일 자동 추출은 실현 불가능합니다 (실측)

초안은 "`CHECKPOINT.md` 자동 추출"을 확정했습니다. **실제 파일 4개를 열어보니 형식이 전부 달랐습니다.**

| 형제 | 줄수 | 마일스톤 표기 | 상태 표기 |
|------|------|-------------|----------|
| 소담컨텍스트엔지니어링 | **1,068** | `## C1 · … [✅ 통과 2026-06-23]` | `[x]` `done-when` `완료` |
| 소담에이전틱엔지니어링 | **919** | `## 0-40. 2026-08-02 — ✅ …` ← **날짜 로그형** | `[ ]` `[x]` `⬜` `done-when` `완료` |
| 소담프롬프트엔지니어링 | **342** | `## P1 — … ✅ done` | `✅ done` `[x]` `done-when` |
| 소담리버스엔지니어링 | **1,243** | `## 3. 마일스톤 상태` → `### M3: … ✅ 완료` ← **3단계 중첩** | `[ ]` `[x]` `완료` `진행중` |

- **마일스톤 접두사가 전부 다름**: `C1` / `0-40` / `P1` / `M3`
- **제목 깊이가 다름**: 2단계 vs 3단계
- **상태 표기 8종 혼용**: `✅` `⬜` `[x]` `[ ]` `완료` `done` `진행중` `통과`
- **소담에이전틱엔지니어링은 마일스톤 구조가 없음** — 날짜별 작업 로그

**총 3,572줄을 파싱해야 하는데 규칙이 4가지입니다.** 형제별 전용 파서 4개를 만들어야 하고, `CHECKPOINT.md` 가 갱신될 때마다 깨집니다. (소담에이전틱엔지니어링 것은 **2026-08-02 오늘도 갱신**됐습니다.)

##### 해법 — 공통분모만 자동, 나머지는 그림자

| 층 | 뽑는 것 | 왜 안 깨지나 |
|---|--------|-----------|
| **1층 — 자동 (전 형제 공통)** | ① 파일 최종 수정일 ② `✅`·`완료`·`done` 개수 ③ `[ ]` 미완료 개수 ④ `done-when` 문자열 존재 여부 | **4형제 전부에 실재하는 것만** 뽑음. 제목 체계·접두사와 무관 |
| **2층 — 그림자 (형제당 1회, 사람)** | 마일스톤 이름·`state`·`done_when` 상세 | `06_ANTI_STALL_SPEC.md` §2 메커니즘. **예외가 아니라 기본 경로로 승격** |

**1층이 만드는 것** — 마일스톤이 아니라 `Project` 수준 요약:

```json
{
  "project_id": "sodam-context-eng",
  "coarse": {
    "checkpoint_mtime": "2026-07-27",
    "done_markers": 23,
    "open_checkboxes": 4,
    "has_done_when": true
  }
}
```

이것만으로도 **"이 형제는 문서가 6일째 안 바뀌었고 미완료 4건이 남아 있다"** 를 말할 수 있습니다. `/graph-why` 의 정지 일수 계산에는 충분합니다.

**2층이 채워지기 전까지의 표시:**

- `state` = `"coarse"` (미상이 아니라 **거친 판정**)
- `/graph-next` 출력: `"문서 기준 미완료 4건 — 상세 단계는 /graph-shadow 로 1회 정리 필요"`
- **그럴듯한 마일스톤을 추측해서 만들지 않는다** (불변)

##### 형제별 적용 (2026-08-02 실측 기준)

| 형제 | 추적 파일 | 1층 | 2층 |
|------|----------|-----|-----|
| 소담컨텍스트엔지니어링 | `CHECKPOINT.md` 1,068줄, `tasks/todo.md` | ✅ | 권장 |
| 소담에이전틱엔지니어링 | `CHECKPOINT.md` 919줄 (날짜 로그형) | ✅ | **필수** (마일스톤 구조 없음) |
| 소담프롬프트엔지니어링 | `CHECKPOINT.md` 342줄 + `AUDIT.log` | ✅ | 권장 |
| 소담리버스엔지니어링 | `CHECKPOINT.md` 1,243줄 | ✅ | 권장 |
| 소담하네스엔지니어링 | **없음** | ❌ (git 활동만) | **필수** |
| 소담루프엔지니어링 | **없음** | ❌ (git 활동만) | **필수** |
| 소담그래프엔지니어링 | (신규) | — | `03_PHASES.md` **M0~M11** 을 그대로 사용 |

> **1층조차 불가능한 2형제**(하네스·루프)는 git 커밋 이력·파일 수정 시각만으로 `coarse` 를 만듭니다. 그래도 `"미상"` 보다는 낫습니다.

---

### 3. Edge (관계)

단계와 단계, 형제와 형제 사이의 연결선.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| `from` | 출발 | `sodam-loop-eng.M4` | O |
| `to` | 도착 | `sodam-loop-eng.M5` | O |
| `type` | 관계 종류 | 아래 표 참조 | O |
| `note` | 사람이 읽는 설명 | `루프 완성 후에만 그래프가 실행을 넘길 수 있음` | X |

**관계 4종:**

| type | 뜻 | 쓰는 곳 |
|------|-----|--------|
| `next` | 이거 끝나면 저거 | 같은 형제 안의 단계 순서 |
| `depends_on` | 저게 먼저 끝나야 이걸 함 | 형제 간 의존 |
| `shares` | 같은 자산을 쓴다 | 공용 훅·설정 파일 |
| `conflicts` | 동시에 건드리면 충돌 | 같은 파일을 두 형제가 쓸 때 |

---

### 4. Blocker (사람 몫)

AI가 대신 못 하는 것. **정체의 진짜 원인을 드러냅니다.**

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| `id` | 식별자 | `blk-001` | O |
| `milestone_id` | 어느 단계가 막혔나 | `sodam-context-eng.M9` | O |
| `kind` | 종류 | `human_test` / `legal` / `external_account` / `decision` / `purchase` | O |
| `description` | 뭘 해야 풀리나 | `새 세션에서 플러그인 실사용 테스트 5종 실행` | O |
| `since` | 언제부터 막혀 있나 | `2026-07-15` | O |

`since` 를 두는 이유: **"18일째 사람 몫 대기 중"** 이라고 말할 수 있어야 사용자가 우선순위를 정할 수 있습니다.

---

### 5. Snapshot (실측 기록)

기계가 형제 폴더를 훑은 결과. `graph.json` 이 아니라 `snapshot.json` 에 들어갑니다.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| `project_id` | 어느 형제 | `sodam-harness-eng` | O |
| `scanned_at` | 언제 훑었나 | `2026-08-02T01:40:00` | O |
| `git_last_commit_date` | 마지막 커밋 날짜 | `2026-07-27` | X |
| `git_last_commit_subject` | 마지막 커밋 제목 | `docs: 상호참조 정리` | X |
| `git_dirty_count` | 미커밋 파일 수 | `1` | X |
| `tracking_files` | 발견된 추적 파일 | `["README.md"]` | O |
| `days_since_activity` | 며칠 조용한가 (계산값) | `6` | O |
| `mismatch` | 정본과 어긋난 점 | `["계획 상태=doing, 실측=6일 무활동"]` | O |

---

## 왜 이 구조인가

### 문제 → 필드 대응

| 사용자가 말한 문제 | 이 모델에서 해결하는 곳 |
|------------------|---------------------|
| 경로를 헷갈려한다 | **`repo_remote` + `markers` 로 식별**(정본), 경로는 매 스캔 파생 → **폴더 개명에 안 깨짐** |
| 세션 바꾸면 다시 설명 | `graph.json` 파일 하나를 읽으면 전체 복원 |
| 검증 끝났는데 안 넘어감 | `Milestone.state` 에 **`verified` 와 `done` 을 분리** + `done_when` 문장 + **자동 승격**(`06` §1) |
| 왜 멈췄는지 모름 | `Blocker.since` 로 "며칠째 사람 몫 대기" 를 수치화 |
| 형제끼리 겹침 | `Edge.type = conflicts / shares` 로 명시 |
| **형제가 서로 못 읽음** | **`~/.sodam/graph-state.json` 공유 발행** — 정본 §4 `isFamilyAlive` 자리 |

### 확장성

- **Phase 2** — `Milestone.verify_cmd` 를 기계가 실행해서 `verified` 를 자동 판정. 필드는 이미 있으므로 구조 변경 없음.
- **Phase 3** — 코드 그래프를 붙일 때 `Project` 아래에 `CodeNode` 엔티티를 추가. 기존 5개는 그대로.
- **그래프 DB로 옮길 때** — `Project`/`Milestone` 은 노드, `Edge` 는 그대로 엣지. 파일 → DB 이전이 1:1로 대응되게 설계했습니다.

### 단순성 (안 넣은 것)

- **사용자 계정·권한** — 본인 전용이므로 불필요
- **변경 이력 테이블** — git이 이미 함. 중복 저장 안 함
- **자유 텍스트 메모** — O-Brain / SoDam-WikiMate 담당. 여기는 **판정에 쓰는 값만**

---

## [NEEDS CLARIFICATION]

**해소됨 (2026-08-02 2차 개정)**

- ~~`days_since_activity` 계산 기준~~ → **git 커밋 + 파일 수정 시각 둘 다.** 근거: 소담루프엔지니어링은 상위 폴더에서 git이 안 잡히고, 소담하네스엔지니어링·소담루프엔지니어링은 추적 파일이 없어 **파일 시각이 유일한 단서**입니다. 둘 중 **더 최근 값**을 활동 시각으로 씁니다.
- ~~`Milestone` 초기 데이터 채우는 법~~ → **2층 추출** (위 §Milestone 참조)

- ~~`coarse` 를 `/graph-why` 점수에 포함할지~~ → **포함하되 신뢰도 0.7을 곱하고 `(상세 미상 — 추정치)` 를 표시.** 근거: 7형제 중 3개가 `coarse` 예상이고 **가장 오래 멈춘 소담루프엔지니어링이 거기 속합니다.** 빼면 `/graph-why` 가 가장 중요한 답을 못 냅니다 (`06_ANTI_STALL_SPEC.md` §3 신뢰도 계수)

**남은 것**

- 없음 — 데이터 모델 관련 미결은 전부 해소됐습니다. 전체 미결 3건은 `01_PRD.md §9` 참조 (전부 사용자 결정 사항)
