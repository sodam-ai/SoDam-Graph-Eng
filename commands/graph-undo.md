---
description: 이미 완료(done) 처리된 것을 되돌립니다. 실수로 자동 확정됐을 때 씁니다.
---

이미 **`done` 으로 확정된** 마일스톤을 `verified` 상태로 되돌리세요.

## 하는 일

```
node "${CLAUDE_PLUGIN_ROOT}/lib/judge.mjs" --undo <마일스톤ID>
```

- 마일스톤 ID를 모르면 먼저 `/graph-where` 나 `/graph-next` 로 확인하세요. **ID를 추측해서 지어내지 마세요.**
- 이 명령은 **`done` 상태에서만** 동작합니다. 아직 승격 대기(`done_candidate`)라면 실패 메시지가 뜨고 `/graph-reject` 로 안내합니다 — 그 안내를 그대로 전하세요.

## `/graph-reject` 와의 차이

| | 시점 | 명령 |
|---|---|---|
| 승격 **전** (아직 사람이 확인할 시간이 있음) | `done_candidate` | `/graph-reject` |
| 승격 **후** (이미 `done` 으로 넘어감) | `done` | `/graph-undo` |

## 결과를 이렇게 전해 주세요

- 성공: "`verified` 로 되돌렸습니다"라고 알려주세요. (`/graph-reject` 와 달리 재제안 방지 기록은 남기지 않습니다 — 되돌린 뒤 조건을 다시 충족하면 또 승격 제안될 수 있다고 안내하세요)
- 실패("done 상태가 아님"): 아직 승격 대기 중일 수 있습니다 — `/graph-reject` 를 안내하세요.

## 규칙 (이 명령의 안전 범위)

- 정본(`graph.json`)의 **해당 마일스톤 하나만** `verified` 로 되돌립니다.
- 형제 저장소는 여전히 **읽기만** 합니다.
