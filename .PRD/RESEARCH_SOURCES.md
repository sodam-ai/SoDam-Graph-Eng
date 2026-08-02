# RESEARCH_SOURCES

# ✅ 최종 결론

**검증 기준일: 2026년 8월 2일**

현재 AI 분야에서 말하는 **Graph Engineering**은 하나의 공식 표준이나 단일 제품명이 아니라, 다음 구조를 함께 설계하는 신흥 엔지니어링 영역으로 보는 것이 가장 정확합니다.

1. **Task Graph / Agent Graph**: AI 에이전트가 어떤 순서와 조건으로 작업하는지
2. **Knowledge Graph / Memory Graph**: AI가 무엇을 기억하고 어떤 관계로 연결하는지
3. **Code Graph**: 코드의 파일·함수·클래스·호출·의존 관계를 AI가 이해하는 구조
4. **GraphRAG / Context Graph**: 질문과 관련된 관계·경로·하위 그래프를 검색하는 구조
5. **Graph Runtime / Observability**: 그래프 실행, 재시도, 검증, 추적, 평가 및 보안

`codejunkie99/graph-engineering` 저장소는 이를 **지식 그래프와 작업 그래프**라는 두 축으로 직접 정의하며, Claude Code에 설치할 수 있는 Skill 형태로 제공합니다. 최근 연구에서는 프롬프트·라우터·병렬 실행·에이전트·검색·집계를 명시적인 실행 그래프로 다루는 것을 **Prompt Graph Engineering**으로 정의하려는 움직임도 확인됩니다. 따라서 단순히 LangGraph만 찾거나 지식 그래프만 찾으면 전체 범위를 놓치게 됩니다. [GitHub](https://github.com/codejunkie99/graph-engineering)

## 설치·사용 방식 구분

- **[직접 설치]** Claude Code Skill·Plugin 또는 Codex Skill로 넣는 방식
- **[MCP 연결]** Claude Code·Codex가 외부 그래프 도구나 그래프 DB를 호출하는 방식
- **[프로젝트 런타임]** Claude Code·Codex가 프로젝트에 패키지를 설치하고 코드를 구현·실행하는 방식
- **[보조 도구]** 그래프 모델링·검증·분석·시각화에 AI가 명령줄이나 스크립트로 사용하는 방식

------

# 1. Graph Engineering 명칭과 직접적으로 일치하는 핵심 자료

## 1-1. 최우선: 설치 가능한 Graph Engineering Skill

```
https://github.com/codejunkie99/graph-engineering
```

이 저장소에는 다음이 들어 있습니다.

- Claude Code용 `graph-engineering` Skill
- 9단계 지식 그래프 구축 파이프라인
- Task Graph 설계 규칙
- GraphRAG·엔터티·관계·이벤트·온톨로지 자료
- 복사하여 사용할 수 있는 워크플로 프롬프트
- 교육용 Teaching Mode
- 패키징된 `.skill` 파일

Claude Code 공식 설치 경로는 저장소에서 다음과 같이 안내합니다. [GitHub](https://github.com/codejunkie99/graph-engineering)

```
git clone https://github.com/codejunkie99/graph-engineering.git
cp -r graph-engineering/graph-engineering ~/.claude/skills/
```

### Windows PowerShell 설치 예시

```
git clone https://github.com/codejunkie99/graph-engineering.git

New-Item -ItemType Directory -Force "$HOME\.claude\skills" | Out-Null

Copy-Item `
  -Recurse `
  -Force `
  ".\graph-engineering\graph-engineering" `
  "$HOME\.claude\skills\graph-engineering"
```

### Codex 적용 여부

저장소는 Claude Code와 기타 Skill 호환 하네스를 대상으로 설명하지만, **Codex 전용 설치 명령까지 공식적으로 제공하지는 않습니다.**

따라서 Codex에서는 다음 순서가 안전합니다.

1. `SKILL.md`와 포함된 스크립트 검토
2. Codex Skill 규격과 호환되는지 확인
3. 사용자 또는 프로젝트 Skill 폴더로 복사
4. 읽기 전용 작업으로 먼저 시험
5. 파일 수정·DB 쓰기 권한은 나중에 허용

현재 저장소 자체가 비교적 새로운 프로젝트이고 GitHub 페이지 기준 커밋 이력도 아직 많지 않으므로, **학습·설계 Skill로는 강력 추천하지만 이것만 단독으로 운영 런타임처럼 의존하는 것은 권장하지 않습니다.** [GitHub](https://github.com/codejunkie99/graph-engineering)

## 1-2. 원본 강의·개념·관련 해설

```
https://github.com/npubird/KnowledgeGraphCourse

https://www.aibuilderclub.com/blog/graph-engineering-with-claude-code
https://flowtivity.ai/blog/graph-engineering-2026-guide-openclaw-codex/
https://www.eigent.ai/blog/graph-engineering-ai-agents
https://codesdevs.io/notes/graph-engineering-ai-agents/

https://arxiv.org/abs/2607.27578
https://arxiv.org/abs/2607.27942
https://arxiv.org/abs/2307.06917
```

`What makes prompts a graph` 논문은 Graph Engineering을 단순한 여러 프롬프트의 모음이 아니라, **명시적 구조·프롬프트 내용과 구조의 분리·실행 의미론·그래프 자체의 일급 엔지니어링 산출물화**라는 조건으로 설명합니다. [arXiv](https://arxiv.org/abs/2607.27578)

------

# 2. Claude Code에서 Graph Engineering을 구현하는 공식 기능

Claude Code에서는 별도의 Python 그래프 프레임워크가 없어도 다음과 같이 매핑할 수 있습니다.

- 노드: Subagent 또는 Agent Team 구성원
- 엣지: 메인 에이전트의 라우팅과 위임
- 결정적 엣지: Hooks
- 상태: 작업 결과·파일·공유 Task List
- 실행 런타임: Claude Agent SDK
- 외부 그래프 도구: MCP

Claude Agent Teams는 독립 컨텍스트를 가진 여러 Claude Code 세션, 공유 작업 목록, 작업 의존성, 상호 메시지를 제공하지만 아직 실험적 기능이며 기본적으로 비활성화되어 있습니다. 병렬화 가치가 낮은 순차 작업에는 단일 세션이나 Subagent가 더 효율적이라고 공식 문서가 설명합니다. [Claude](https://code.claude.com/docs/en/agent-teams)

## 2-1. 공식 핵심 주소

```
https://code.claude.com/docs/en/overview
https://github.com/anthropics/claude-code

https://code.claude.com/docs/en/agent-teams
https://code.claude.com/docs/ko/agent-teams
https://code.claude.com/docs/en/sub-agents
https://code.claude.com/docs/ko/sub-agents
https://code.claude.com/docs/en/agents

https://code.claude.com/docs/en/hooks
https://code.claude.com/docs/en/agent-sdk/hooks

https://code.claude.com/docs/en/skills
https://code.claude.com/docs/en/plugins-reference
https://code.claude.com/docs/en/discover-plugins
https://code.claude.com/docs/en/plugin-marketplaces

https://code.claude.com/docs/en/mcp
https://code.claude.com/docs/en/mcp-quickstart

https://code.claude.com/docs/en/agent-sdk/overview
https://code.claude.com/docs/en/agent-sdk/plugins
https://code.claude.com/docs/en/agent-sdk/observability
```

## 2-2. Anthropic의 공식 에이전트 그래프 설계 자료

```
https://www.anthropic.com/engineering/building-effective-agents
https://www.anthropic.com/engineering/multi-agent-research-system
```

Anthropic의 공식 설계 패턴은 다음 Graph 패턴으로 해석할 수 있습니다.

- Prompt Chaining → 선형 그래프
- Routing → 조건부 엣지
- Parallelization → Fan-out/Fan-in
- Orchestrator–Workers → 허브와 작업 노드
- Evaluator–Optimizer → 검증 후 되돌아가는 루프

Anthropic은 무조건 복잡한 멀티에이전트 구조를 만들기보다, 우선 단순하고 조합 가능한 패턴에서 시작하라고 권장합니다. [Anthropic](https://www.anthropic.com/engineering/building-effective-agents?subjects=alignment)

## 2-3. Agent Teams 활성화

```
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

Agent Teams는 현재 실험적 기능이며 토큰 사용량과 조정 비용이 크게 증가할 수 있습니다. 파일 충돌이 많거나 작업 의존성이 강한 그래프에는 무조건 적합하지 않습니다. [Claude](https://code.claude.com/docs/en/agent-teams)

------

# 3. Codex에서 Graph Engineering을 구현하는 공식 기능

Codex에는 Claude Code의 Agent Teams와 완전히 같은 기능만 있는 것이 아니라, 다음 구성 요소를 조합하는 방식이 핵심입니다.

- `AGENTS.md`: 저장소·경로별 정책과 실행 지침
- Agent Skills: 재사용 가능한 작업 노드
- MCP: 그래프 DB·코드 그래프·메모리 그래프 연결
- `config.toml`: 승인·샌드박스·MCP·텔레메트리
- OpenAI Agents SDK: 코드 기반 노드·Handoff·Manager 구조
- Codex CLI: 그래프 프레임워크의 설치·생성·실행·검증

## 3-1. Codex 공식 주소

```
https://github.com/openai/codex

https://developers.openai.com/codex/guides/agents-md
https://learn.chatgpt.com/docs/build-skills
https://learn.chatgpt.com/docs/extend/mcp?surface=cli

https://developers.openai.com/codex/config-basic
https://developers.openai.com/codex/config-advanced
https://developers.openai.com/codex/config-reference

https://github.com/openai/skills
```

OpenAI의 Codex Skills 문서와 MCP 문서는 현재 `learn.chatgpt.com` 문서로 연결됩니다. Skills는 그래프의 재사용 가능한 작업 노드로, MCP 서버는 그래프 DB·코드 분석기·외부 실행 시스템으로 연결하는 인터페이스로 사용할 수 있습니다. [OpenAI Developers](https://developers.openai.com/codex/skills)

## 3-2. OpenAI Agents SDK

```
https://github.com/openai/openai-agents-python
https://openai.github.io/openai-agents-python/

https://openai.github.io/openai-agents-python/quickstart/
https://openai.github.io/openai-agents-python/multi_agent/
https://openai.github.io/openai-agents-python/handoffs/
https://openai.github.io/openai-agents-python/tools/
https://openai.github.io/openai-agents-python/tracing/
https://openai.github.io/openai-agents-python/guardrails/
https://openai.github.io/openai-agents-python/sandbox/guide/

https://openai.com/index/new-tools-for-building-agents/
https://openai.com/index/the-next-evolution-of-the-agents-sdk/
https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/
```

설치:

```
pip install openai-agents
```

Agents SDK는 크게 다음 두 그래프 구조를 지원합니다.

- **Manager as Tools**: 중앙 오케스트레이터가 다른 에이전트를 도구처럼 호출
- **Handoffs**: 한 에이전트가 다음 전문 에이전트로 실행 책임을 넘김

다만 OpenAI Agents SDK는 **Codex CLI에 설치하는 플러그인 자체가 아니라**, Codex가 프로젝트 안에서 구축·실행하도록 만드는 애플리케이션 런타임입니다. [OpenAI GitHub Pages](https://openai.github.io/openai-agents-python/multi_agent/)

------

# 4. Claude Code·Codex 공통 호환 표준

## 4-1. Agent Skills

```
https://agentskills.io/
https://github.com/agentskills/agentskills
```

Agent Skills는 `SKILL.md`, 참고 자료, 스크립트 등을 묶어 여러 AI 도구에서 재사용하기 위한 공개 형식입니다. Graph Engineering에서는 하나의 Skill을 그래프상의 전문 작업 노드로 사용할 수 있습니다. [GitHub](https://github.com/agentskills/agentskills)

## 4-2. AGENTS.md

```
https://agents.md/
```

프로젝트 전체 또는 하위 폴더별로 다음 정보를 정의할 수 있습니다.

- 그래프 실행 규칙
- 작업 노드별 책임
- 허용·금지 도구
- 테스트·검증 게이트
- 실패 시 되돌림 규칙
- 그래프 DB 쓰기 정책

## 4-3. Model Context Protocol

```
https://modelcontextprotocol.io/
https://modelcontextprotocol.io/docs/getting-started/intro

https://github.com/modelcontextprotocol/modelcontextprotocol
https://github.com/modelcontextprotocol/servers
https://github.com/modelcontextprotocol/python-sdk
https://github.com/modelcontextprotocol/typescript-sdk

https://registry.modelcontextprotocol.io/
```

MCP는 Claude Code·Codex를 Neo4j, FalkorDB, Memgraph, Neptune, 코드 그래프, 메모리 그래프 등에 연결하는 핵심 표준입니다. 공식 레지스트리는 최신 서버와 배포 정보를 찾을 때 우선 확인해야 합니다. [GitHub](https://github.com/modelcontextprotocol/modelcontextprotocol)

## 4-4. A2A와 AG-UI

```
https://github.com/a2aproject/A2A
https://google-a2a.github.io/A2A/latest/

https://github.com/ag-ui-protocol/ag-ui
https://docs.ag-ui.com/
```

- A2A: 서로 다른 에이전트 시스템 사이의 통신
- AG-UI: 에이전트 실행 이벤트와 사용자 인터페이스의 연결

멀티에이전트 Graph를 다른 실행 환경이나 UI까지 확장할 때 관련성이 큽니다. [GitHub](https://github.com/a2aproject/A2A/)

------

# 5. 에이전트·워크플로 Graph 런타임

이 구간의 도구는 Claude Code나 Codex 내부에 넣는 플러그인이 아니라, **AI가 프로젝트에 설치하고 Graph를 구현·실행하도록 하는 프레임워크**입니다.

## 5-1. LangGraph — Python·TypeScript 최우선

```
https://github.com/langchain-ai/langgraph

https://docs.langchain.com/oss/python/langgraph/overview
https://docs.langchain.com/oss/python/langgraph/workflows-agents
https://reference.langchain.com/python/langgraph/overview

https://docs.langchain.com/oss/javascript/langgraph/overview
https://docs.langchain.com/oss/javascript/langgraph/workflows-agents
```

설치:

```
pip install -U langgraph
```

주요 용도:

- 명시적인 Node·Edge·State
- 조건부 분기
- 병렬 Fan-out/Fan-in
- Checkpoint와 재개
- Human-in-the-loop
- 장기 실행과 Durable Execution
- 실행 중 상태 검사

Graph Engineering을 코드로 구현하려는 Python 프로젝트에서 가장 직접적인 선택지 중 하나입니다. [Docs by LangChain](https://docs.langchain.com/oss/python/langgraph/workflows-agents)

## 5-2. Pydantic Graph

```
https://ai.pydantic.dev/graph/
https://ai.pydantic.dev/graph/beta/
https://github.com/pydantic/pydantic-ai
```

설치:

```
pip install pydantic-graph
```

Python 타입 안정성, 상태 머신, 분기·병렬·Join·Reducer를 중요하게 볼 때 적합합니다. [Pydantic](https://pydantic.dev/docs/ai/graph/graph/)

## 5-3. Microsoft Agent Framework

```
https://github.com/microsoft/agent-framework
https://learn.microsoft.com/en-us/agent-framework/workflows/
https://learn.microsoft.com/en-us/agent-framework/workflows/workflows

https://github.com/microsoft/agent-framework-go
```

지원 구조:

- Executor와 Edge
- 순차·병렬·Handoff
- Checkpoint
- Human-in-the-loop
- Python·.NET
- Go 구현

Microsoft 신규 프로젝트에서는 기존 AutoGen보다 Agent Framework를 우선 검토하는 것이 안전합니다. [GitHub](https://github.com/MicrosoftDocs/semantic-kernel-docs/blob/main/agent-framework/overview/index.md)

## 5-4. Google Agent Development Kit Graphs

```
https://adk.dev/graphs/

https://github.com/google/adk-python
https://github.com/google/adk-js
https://github.com/google/adk-go
```

Google ADK Graphs는 코드, 도구, 사람, LLM 노드를 결정적 그래프 안에 함께 배치하는 구조를 제공합니다. [ADK](https://adk.dev/graphs/)

## 5-5. Strands Agents

```
https://strandsagents.com/
https://github.com/strands-agents

https://github.com/strands-agents/sdk-python
https://github.com/strands-agents/sdk-typescript
https://github.com/strands-agents/tools

https://strandsagents.com/docs/api/typescript/Graph/
```

설치:

```
pip install strands-agents strands-agents-tools
npm install @strands-agents/sdk
```

Graph·Workflow·Swarm과 MCP·OpenTelemetry를 함께 사용할 수 있는 모델 독립형 프레임워크입니다. [GitHub](https://github.com/strands-agents)

## 5-6. Mastra — TypeScript 강력 추천

```
https://github.com/mastra-ai/mastra
https://mastra.ai/
https://mastra.ai/ai-workflows
https://github.com/mastra-ai/skills
```

Mastra는 TypeScript 기반의 분기·병렬 실행·중첩 워크플로·Suspend/Resume를 제공하며, Mastra Studio에서 실행 그래프를 시각적으로 확인할 수 있습니다. 공식 Coding Agent Skills도 별도로 제공합니다. [Mastra](https://mastra.ai/ai-workflows)

## 5-7. CrewAI

```
https://github.com/crewAIInc/crewAI
https://docs.crewai.com/
https://docs.crewai.com/concepts/flows
```

- Crew: 역할 기반 멀티에이전트
- Flow: 이벤트 기반 실행 그래프
- Router·Listener·상태·지속성·재개 [CrewAI Documentation](https://docs.crewai.com/)

## 5-8. LlamaIndex Workflows

```
https://github.com/run-llama/llama_index
https://docs.llamaindex.ai/
```

LlamaIndex는 Agent Workflow와 Property Graph 기반 검색을 한 생태계에서 구성할 수 있다는 장점이 있습니다. [GitHub](https://github.com/run-llama/llama_index)

## 5-9. 연구·신흥 Graph 중심 프레임워크

```
https://github.com/BUPT-GAMMA/MASFactory
https://arxiv.org/abs/2603.06007

https://github.com/Lightblues/FlowAgent
https://arxiv.org/abs/2502.14345

https://arxiv.org/abs/2605.22566
https://arxiv.org/abs/2605.14968
```

`MASFactory`는 자연어 요구를 편집 가능한 Graph로 만든 뒤 실행 그래프로 컴파일하는 **Vibe Graphing** 개념을 제안합니다. 연구 단계 자료이므로 상용 핵심 런타임보다는 실험·참고 용도로 분류해야 합니다. [arXiv](https://arxiv.org/abs/2603.06007)

------

# 6. 시각적·로우코드 Graph 워크플로 도구

Claude Code·Codex가 프로젝트를 설치하거나 설정 파일·DSL·API를 생성할 수 있지만, 일반적으로 **Claude Code/Codex 자체 플러그인은 아닙니다.**

## 6-1. Dify

```
https://dify.ai/
https://www.dify.ai/workflows
https://github.com/langgenius/dify
https://github.com/langgenius/dify-official-plugins
```

모델 호출, 검색, 코드, 분기, Trigger, 사람 검토, MCP 도구를 시각적 그래프에 연결할 수 있습니다. [Dify](https://www.dify.ai/workflows)

## 6-2. Flowise

```
https://flowiseai.com/
https://github.com/FlowiseAI/Flowise
https://github.com/FlowiseAI/FlowiseDocs
```

AgentFlow, 분기·반복·라우팅, API·SDK·CLI를 제공하는 시각적 Agent Workflow 플랫폼입니다. [GitHub](https://github.com/FlowiseAI/Flowise)

## 6-3. Langflow

```
https://www.langflow.org/
https://github.com/langflow-ai/langflow
```

시각적으로 Agent·RAG·도구 Graph를 작성하고, 완성한 흐름을 API 또는 MCP 서버 형태로 제공할 수 있습니다. [GitHub](https://github.com/langflow-ai/langflow)

## 6-4. Microsoft Prompt Flow — 신규 도입 주의

```
https://github.com/microsoft/promptflow
https://microsoft.github.io/promptflow/
https://microsoft.github.io/promptflow/how-to-guides/develop-a-dag-flow/
```

Prompt Flow는 `flow.dag.yaml`로 LLM·Python·도구를 DAG로 구성하는 대표적 도구였지만, 공식 문서 기준 **2026년 4월 20일에 기능 개발이 종료**되었고 Microsoft Agent Framework로의 이전이 권장됩니다. 기존 시스템 유지·이전 분석 목적 외에는 신규 핵심 스택으로 추천하지 않습니다. [GitHub](https://github.com/microsoft/promptflow)

------

# 7. 코드베이스를 Graph로 만드는 Claude Code·Codex 도구

## 7-1. GitNexus — 최우선 추천

```
https://github.com/nxpatterns/gitnexus
https://www.npmjs.com/package/gitnexus
```

기본 명령:

```
npx gitnexus analyze
npx gitnexus setup
```

Claude Code MCP:

```
claude mcp add gitnexus -- npx -y gitnexus@latest mcp
```

Codex MCP:

```
codex mcp add gitnexus -- npx -y gitnexus@latest mcp
```

GitNexus는 코드 인덱싱, 코드 지식 그래프, MCP, Skill·Hook 통합을 제공하며 Claude Code와 Codex를 모두 명시적으로 지원합니다. [GitHub](https://github.com/nxpatterns/gitnexus)

## 7-2. CodeGraph

```
https://github.com/colbymchenry/codegraph
https://www.npmjs.com/package/@colbymchenry/codegraph
```

설치:

```
npx @colbymchenry/codegraph
```

자동 설치 대상 지정:

```
codegraph install --target=claude,codex --yes
```

Tree-sitter로 코드를 분석하고 SQLite에 Symbol·Edge·File 관계를 보관하며, Claude Code·Codex용 설정 파일까지 자동 생성할 수 있습니다. 설치 프로그램이 설정 파일을 수정하므로 `--print-config`로 먼저 내용을 확인하는 방식이 안전합니다. [GitHub](https://github.com/colbymchenry/codegraph)

## 7-3. Codebase Memory MCP

```
https://github.com/DeusData/codebase-memory-mcp
https://www.npmjs.com/package/codebase-memory-mcp
https://arxiv.org/abs/2603.27277
```

Tree-sitter 기반의 지속적인 코드 지식 그래프를 만들고 MCP로 제공합니다. 설정 파일을 자동 수정하는 기능이 있으므로 적용 전 Git Diff 확인이 필요합니다. [GitHub](https://github.com/DeusData/codebase-memory-mcp)

## 7-4. CodeGraphContext

```
https://github.com/CodeGraphContext/CodeGraphContext
https://codegraphcontext.vercel.app/
```

Tree-sitter·SCIP 분석 결과를 그래프 DB에 저장하고 MCP로 제공하는 구조입니다. 여러 언어와 그래프 DB 백엔드를 다뤄야 할 때 후보가 됩니다. [GitHub](https://github.com/CodeGraphContext/CodeGraphContext)

## 7-5. Graphify

```
https://github.com/Graphify-Labs/graphify
```

Claude Code·Codex·Cursor·Gemini CLI 등의 Agent Skills 규격을 이용해 코드, 문서, 스키마, 설정 관계를 그래프로 만드는 프로젝트입니다. [GitHub](https://github.com/Graphify-Labs/graphify)

## 7-6. Claude Code용 Code Graph Plugin

```
https://github.com/sdsrss/code-graph-mcp
```

MCP, Slash Command, Subagent, Hook를 하나의 Claude Code 플러그인 구조로 묶습니다. [GitHub](https://github.com/sdsrss/code-graph-mcp)

## 7-7. 추가 코드 그래프 프로젝트

```
https://github.com/tirth8205/code-review-graph
https://github.com/vitali87/code-graph-rag
https://github.com/JudiniLabs/mcp-code-graph
https://github.com/CartographAI/mcp-server-codegraph
https://github.com/Phoenixrr2113/codebase-graph
https://github.com/suatkocar/codegraph
https://github.com/andrew-hernandez-paragon/code-graph-context
https://github.com/er77/code-graph-rag-mcp
```

이 그룹은 기능과 성숙도가 서로 다르므로, 바로 전역 설치하기보다는 다음을 확인해야 합니다.

- 최근 Commit·Release
- 자동 설정 파일 수정 여부
- 지원 언어
- 로컬 전용 여부
- DB 의존성
- 쓰기 도구 존재 여부
- 라이선스
- 테스트와 보안 정책

## 7-8. 정적 분석·Code Property Graph

```
https://github.com/joernio/joern
https://docs.joern.io/
https://cpg.joern.io/

https://github.com/ShiftLeftSecurity/codepropertygraph
https://github.com/SYSUSELab/RepoDoc
```

Joern은 AST뿐 아니라 Control Flow·Data Flow·Call Graph 등을 결합한 Code Property Graph를 사용합니다. 보안 취약점 경로·Source-to-Sink·대규모 코드 분석에는 강하지만, Claude Code·Codex에 바로 설치하는 Skill이 아니므로 MCP 또는 CLI 래퍼가 필요합니다. [GitHub](https://github.com/joernio/joern)

------

# 8. Knowledge Graph·GraphRAG·Agent Memory

## 8-1. Microsoft GraphRAG

```
https://github.com/microsoft/graphrag
https://microsoft.github.io/graphrag/
https://microsoft.github.io/graphrag/get_started/
```

설치:

```
python -m pip install graphrag
graphrag init --root ./my-project
```

Microsoft GraphRAG는 비정형 문서에서 엔터티·관계·커뮤니티와 보고서를 생성하는 대표적 GraphRAG 구현입니다. 인덱싱 시 많은 모델 호출과 비용이 발생할 수 있으며, 버전 업그레이드 시 설정 마이그레이션 확인이 필요합니다. [GitHub](https://github.com/microsoft/graphrag)

## 8-2. Neo4j GraphRAG for Python

```
https://github.com/neo4j/neo4j-graphrag-python
https://neo4j.com/docs/neo4j-graphrag-python/current/
https://neo4j.com/docs/neo4j-graphrag-python/current/user_guide_rag.html
```

설치:

```
pip install neo4j-graphrag
```

OpenAI 연동 패키지 포함:

```
pip install "neo4j-graphrag[openai]"
```

기존 `neo4j-genai` 패키지는 사용 중단 방향이므로 신규 프로젝트에서는 `neo4j-graphrag`를 우선해야 합니다. [Neo4j Graph Intelligence Platform](https://neo4j.com/docs/neo4j-graphrag-python/current/index.html)

## 8-3. Graphiti / Zep

```
https://github.com/getzep/graphiti
https://github.com/getzep/graphiti/tree/main/mcp_server
https://github.com/getzep/graphiti/blob/main/mcp_server/README.md
```

설치:

```
pip install graphiti-core
```

Graphiti는 사실이 언제 유효했는지를 보존하는 Temporal Knowledge Graph에 강하며, MCP 서버를 통해 Claude Code·Codex와 연결할 수 있습니다. [GitHub](https://github.com/getzep/graphiti)

## 8-4. Cognee

```
https://github.com/topoteretes/cognee
https://github.com/topoteretes/cognee-integrations
```

설치:

```
pip install cognee
```

Claude Code Plugin 로컬 실행 예시:

```
git clone https://github.com/topoteretes/cognee-integrations.git
claude --plugin-dir ./cognee-integrations/integrations/claude-code
```

Cognee는 문서·데이터를 임베딩과 그래프 구조로 처리하고 Agent Memory로 활용하는 데이터·메모리 레이어입니다. [GitHub](https://github.com/topoteretes/cognee)

## 8-5. MemoryGraph

```
https://github.com/memory-graph/memory-graph
https://memorygraph.dev/docs/installation/
```

설치:

```
pipx install memorygraphMCP
```

Claude Code:

```
claude mcp add --scope user memorygraph -- memorygraph
```

SQLite, Neo4j, Memgraph, FalkorDB 등 여러 백엔드를 사용할 수 있는 MCP 기반 그래프 메모리입니다. [GitHub](https://github.com/memory-graph/memory-graph)

## 8-6. LightRAG

```
https://github.com/HKUDS/LightRAG
https://arxiv.org/abs/2410.05779
```

Graph와 Vector 검색을 함께 사용하며 증분 업데이트, 평가, 추적 통합을 지원하는 인기 GraphRAG 계열입니다. [GitHub](https://github.com/HKUDS/LightRAG?ref=omelet.tech)

## 8-7. RAG-Anything

```
https://github.com/HKUDS/RAG-Anything
https://arxiv.org/abs/2510.12323
```

텍스트뿐 아니라 이미지·표·수식·문서 구조를 관계 그래프로 연결하는 멀티모달 RAG 계열입니다. [GitHub](https://github.com/HKUDS/RAG-Anything)

## 8-8. HippoRAG

```
https://github.com/OSU-NLP-Group/HippoRAG
```

지식 그래프와 Personalized PageRank를 이용해 인간의 장기 기억과 유사한 다중 홉 검색을 구현하는 연구·구현체입니다. [GitHub](https://github.com/osu-nlp-group/hipporag)

## 8-9. OpenSPG / KAG

```
https://github.com/OpenSPG/KAG
https://openspg.github.io/v2/docs_en
```

도메인 지식 그래프 구축과 논리적 검색·추론을 포함한 Knowledge Augmented Generation 시스템입니다. [GitHub](https://github.com/openspg/kag)

## 8-10. LlamaIndex Property Graph

```
https://github.com/run-llama/llama_index
https://docs.llamaindex.ai/en/stable/module_guides/indexing/lpg_index_guide/
```

## 8-11. GraphRAG 추가 구현·연구

```
https://github.com/circlemind-ai/fast-graphrag
https://pypi.org/project/fast-graphrag/

https://github.com/gusye1234/nano-graphrag
https://pypi.org/project/nano-graphrag/

https://github.com/BUPT-GAMMA/PathRAG
https://arxiv.org/abs/2502.14902

https://github.com/tigergraph/graphrag

https://github.com/Graph-RAG/GraphRAG
https://github.com/graphrag

https://arxiv.org/abs/2501.00309
```

이 그룹은 Microsoft GraphRAG보다 가볍거나 특정 검색 경로·그래프 DB·성능 문제를 해결하려는 대안들입니다. 성숙도와 유지보수 상태가 다르므로 Microsoft·Neo4j·LightRAG 계열과 비교한 뒤 선택해야 합니다. [PyPI](https://pypi.org/project/fast-graphrag/)

------

# 9. Graph Database MCP — Claude Code·Codex 직접 연결

## 9-1. Neo4j 공식 MCP

```
https://github.com/neo4j/mcp
https://neo4j.com/docs/mcp/current/
https://neo4j.com/docs/mcp/current/quickstart/
```

설치:

```
pip install neo4j-mcp-server
```

초기에는 반드시 읽기 전용 계정과 Read-only 모드부터 적용하는 것이 안전합니다. [GitHub](https://github.com/neo4j/mcp)

### 구형·Labs 구현

```
https://github.com/neo4j-contrib/mcp-neo4j
```

공식 Neo4j MCP가 요구사항을 충족한다면 신규 시스템에서는 공식 제품 저장소를 먼저 선택하는 것이 좋습니다. Labs 저장소에는 공식 제품과 같은 지원 보장이 없을 수 있습니다. [GitHub](https://github.com/neo4j-contrib/mcp-neo4j)

## 9-2. FalkorDB MCP

```
https://github.com/FalkorDB/FalkorDB
https://github.com/FalkorDB/FalkorDB-MCPServer

https://docs.falkordb.com/genai-tools/mcpserver/
https://docs.falkordb.com/genai-tools/mcpserver/quickstart.html

https://www.npmjs.com/package/@falkordb/mcpserver
```

실행:

```
npx -y @falkordb/mcpserver@latest
```

GraphRAG와 Agent Memory를 비교적 가볍게 구성하고 싶을 때 유용하며 Read-only 설정을 지원합니다. [FalkorDB Docs](https://docs.falkordb.com/genai-tools/mcpserver/quickstart.html)

## 9-3. Memgraph

```
https://github.com/memgraph/memgraph
https://github.com/memgraph/mcp-memgraph

https://memgraph.com/blog/introducing-memgraph-mcp-server
https://memgraph.com/agentic-ai
https://www.memgraph.ai/docs
```

실시간 Property Graph, GraphRAG, Agent Memory, MCP를 함께 검토할 수 있습니다. [Memgraph](https://memgraph.com/blog/introducing-memgraph-mcp-server)

## 9-4. Amazon Neptune MCP

```
https://awslabs.github.io/mcp/servers/amazon-neptune-mcp-server
https://github.com/awslabs/mcp

https://aws.amazon.com/about-aws/whats-new/2025/05/amazon-neptune-mcp-server/
https://docs.aws.amazon.com/neptune/latest/userguide/tools.html
```

AWS Neptune의 OpenCypher·Gremlin 그래프를 MCP를 통해 Claude Code 등에서 사용할 수 있습니다. [Amazon Web Services, Inc.](https://aws.amazon.com/about-aws/whats-new/2025/05/amazon-neptune-mcp-server/)

## 9-5. ArangoDB MCP

```
https://docs.arango.ai/ecosystem/arangodb-mcp-server/
https://github.com/arangodb/arangodb
```

문서·Key-Value·Graph를 한 DB에서 사용해야 할 때 검토할 수 있습니다. [docs.arango.ai](https://docs.arango.ai/ecosystem/arangodb-mcp-server/)

## 9-6. GitHub 공식 MCP

```
https://github.com/github/github-mcp-server
```

GitHub 자체가 그래프 DB는 아니지만 Repository·Issue·PR·Commit·파일 관계를 Agent Graph의 외부 컨텍스트로 연결하는 공식 MCP입니다. Read-only·도구 제한·Lockdown 설정을 우선 적용해야 합니다. [GitHub](https://github.com/github/github-mcp-server)

------

# 10. 그래프 데이터베이스·저장소 추가 후보

이 도구들은 모두 Claude Code·Codex가 CLI·SDK·Docker·API를 통해 설치하거나 다룰 수 있지만, 전부 공식 MCP가 있는 것은 아닙니다.

```
https://neo4j.com/
https://github.com/neo4j/neo4j

https://www.falkordb.com/
https://github.com/FalkorDB/FalkorDB

https://memgraph.com/
https://github.com/memgraph/memgraph

https://aws.amazon.com/neptune/

https://arangodb.com/
https://github.com/arangodb/arangodb

https://www.tigergraph.com/
https://github.com/tigergraph

https://janusgraph.org/
https://github.com/JanusGraph/janusgraph

https://nebula-graph.io/
https://github.com/vesoft-inc/nebula

https://age.apache.org/
https://github.com/apache/age
https://age.apache.org/getstarted/quickstart/

https://jena.apache.org/
https://github.com/apache/jena

https://github.com/oxigraph/oxigraph
```

Apache AGE는 PostgreSQL 확장으로 Property Graph와 Cypher를 추가하므로 기존 PostgreSQL 중심 프로젝트에 특히 관련성이 있습니다. 별도 그래프 DB를 추가하지 않고 관계형 데이터와 Graph를 함께 사용하고 싶을 때 후보가 됩니다. [GitHub](https://github.com/apache/age)

------

# 11. Graph 모델링·쿼리·검증 표준

## 11-1. Property Graph·GQL·Cypher

```
https://www.iso.org/standard/76120.html

https://opencypher.org/
https://github.com/opencypher/openCypher

https://neo4j.com/docs/cypher-manual/current/
```

ISO/IEC 39075:2024 GQL은 Property Graph의 생성·접근·조회·수정과 구조를 정의하는 국제 표준입니다. 다만 ISO 원문 문서는 유료일 수 있습니다. [iso.org](https://www.iso.org/standard/76120.html)

## 11-2. Gremlin·Apache TinkerPop

```
https://tinkerpop.apache.org/
https://tinkerpop.apache.org/gremlin.html
https://github.com/apache/tinkerpop
```

Gremlin은 여러 Property Graph 시스템에서 사용할 수 있는 그래프 순회 언어이자 실행 모델입니다. [tinkerpop.apache.org](https://tinkerpop.apache.org/)

## 11-3. RDF·SPARQL·OWL

```
https://www.w3.org/TR/rdf12-concepts/
https://www.w3.org/TR/sparql12-query/
https://www.w3.org/TR/owl2-overview/

https://www.w3.org/RDF/
https://www.w3.org/2001/sw/wiki/SPARQL
```

RDF는 사실·관계를 Triple로 표현하고, SPARQL은 이를 검색하며, OWL은 온톨로지와 논리적 제약을 정의합니다.

## 11-4. SHACL 검증

```
https://www.w3.org/TR/shacl/
https://www.w3.org/TR/shacl12-core/
https://www.w3.org/TR/shacl12-rules/
https://www.w3.org/TR/shacl12-sparql/

https://github.com/RDFLib/pySHACL
```

설치:

```
pip install pyshacl
```

AI가 만든 지식 그래프가 스키마·필수 속성·값 범위·관계 규칙을 지키는지 자동 검증할 수 있습니다. 다만 SHACL 1.2 관련 문서는 현재 최종 확정 표준이 아닌 Working Draft 단계가 포함되므로 버전 고정과 호환성 확인이 필요합니다. [GitHub](https://github.com/rdflib/pyshacl)

## 11-5. RDFLib·Apache Jena·Protégé

```
https://github.com/RDFLib/rdflib
https://rdflib.readthedocs.io/en/stable/

https://jena.apache.org/
https://jena.apache.org/documentation/index.html
https://github.com/apache/jena

https://protege.stanford.edu/
https://github.com/protegeproject/protege
https://protegeproject.github.io/protege/
https://github.com/protegeproject/webprotege
```

- RDFLib: Python RDF·SPARQL
- Apache Jena: Java 기반 RDF·SPARQL·추론
- Protégé: OWL 온톨로지 시각적 설계

Claude Code·Codex가 온톨로지 파일을 생성한 뒤 이 도구들로 검증하도록 구성할 수 있습니다. [GitHub](https://github.com/RDFLib/rdflib)

------

# 12. 그래프 분석·알고리즘·시각화

## 12-1. NetworkX

```
https://github.com/networkx/networkx
https://networkx.org/documentation/stable/
```

Python에서 DAG 검사, Cycle 탐지, 최단 경로, 중심성, 연결 요소, Topological Sort를 수행할 때 기본 선택입니다. [GitHub](https://github.com/networkx/networkx)

## 12-2. igraph

```
https://igraph.org/
https://github.com/igraph/igraph
```

대규모 그래프의 빠른 분석과 커뮤니티 탐지에 적합합니다. [arXiv](https://arxiv.org/abs/2311.10260)

## 12-3. Graphviz

```
https://graphviz.org/
https://graphviz.org/documentation/
https://github.com/rossbar/graphviz
```

DOT 텍스트를 SVG·PNG·PDF 그래프로 변환할 수 있어 Claude Code·Codex가 자동 산출물을 만들기에 좋습니다. [Graphviz](https://graphviz.org/)

## 12-4. Mermaid

```
https://github.com/mermaid-js/mermaid
https://mermaid.ai/open-source/intro/
```

Markdown 안에서 Flowchart, State Diagram, Sequence Diagram, Architecture Diagram을 만들 수 있어 `README.md`, `DESIGN.md`, `AGENTS.md`와 함께 사용하기 좋습니다. [GitHub](https://github.com/mermaid-js/mermaid)

## 12-5. Cytoscape.js

```
https://github.com/cytoscape/cytoscape.js
https://js.cytoscape.org/
```

웹페이지에서 대화형 코드 그래프·지식 그래프·에이전트 실행 그래프를 보여줄 때 적합합니다. [GitHub](https://github.com/cytoscape/cytoscape.js)

## 12-6. Gephi

```
https://github.com/gephi/gephi
https://gephi.org/
https://docs.gephi.org/desktop/
```

대규모 네트워크 탐색·필터링·레이아웃·통계 시각화용 데스크톱 도구입니다. [GitHub](https://github.com/gephi/gephi)

------

# 13. Graph 실행 관측·평가·검증

## 13-1. LangSmith

```
https://docs.langchain.com/langsmith/observability
https://docs.langchain.com/oss/python/langgraph/observability
```

## 13-2. Langfuse

```
https://github.com/langfuse/langfuse
https://langfuse.com/docs/observability/get-started
```

## 13-3. Arize Phoenix

```
https://github.com/Arize-ai/phoenix
https://arize.com/docs/phoenix
```

Phoenix는 OpenTelemetry를 기반으로 OpenAI Agents SDK, Claude Agent SDK, LangGraph, Mastra, CrewAI, LlamaIndex 등의 실행 Trace를 분석할 수 있습니다. [GitHub](https://github.com/Arize-ai/phoenix/)

## 13-4. OpenTelemetry GenAI

```
https://opentelemetry.io/docs/specs/semconv/
https://github.com/open-telemetry/semantic-conventions-genai
```

Agent, Tool, Model, MCP 호출을 공통 Trace로 기록할 때 핵심입니다. [GitHub](https://github.com/open-telemetry/semantic-conventions-genai)

## 13-5. Agent Graph 정적 분석·검증 연구

```
https://arxiv.org/abs/2607.01640
https://arxiv.org/abs/2603.20356
https://arxiv.org/abs/2605.14968
https://arxiv.org/abs/2605.22566
https://arxiv.org/abs/2605.31308
https://arxiv.org/abs/2606.15116
```

`AgentFlow` 연구는 에이전트, 프롬프트, 모델, 도구, 메모리, 정책을 Typed Node로 만들고 제어·데이터·의존 관계를 Agent Dependency Graph로 분석합니다. Agent BOM과 Prompt-to-Tool 위험 분석이라는 점에서 Graph Engineering의 보안·거버넌스 축과 직접 연결됩니다. [arXiv](https://arxiv.org/abs/2607.01640)

------

# 14. Graph Machine Learning·대규모 그래프 처리

이 분야는 Agent Graph Engineering과 직접 같은 뜻은 아니지만, **그래프 엔지니어링이라는 표현과 혼동되거나 지식 그래프 임베딩·링크 예측 단계에서 함께 사용**될 수 있습니다.

## 14-1. PyTorch Geometric

```
https://github.com/pyg-team/pytorch_geometric
https://pytorch-geometric.readthedocs.io/en/stable/
```

설치:

```
pip install torch_geometric
```

GNN, Node Classification, Link Prediction, Graph Classification 등에 사용됩니다. 

## 14-2. DGL

```
https://github.com/dmlc/dgl
https://www.dgl.ai/
https://www.dgl.ai/dgl_docs/
```

## 14-3. GraphScope

```
https://github.com/alibaba/GraphScope
https://graphscope.io/
https://graphscope.io/docs/
```

대규모 Graph 분석, 대화형 질의, Graph Learning을 통합한 분산 플랫폼입니다. 

------

# 15. 학습·논문·벤치마크·자료 모음

## 15-1. Knowledge Graph 과정

```
https://github.com/npubird/KnowledgeGraphCourse
```

## 15-2. GraphRAG 자료 모음

```
https://github.com/Graph-RAG/GraphRAG
https://github.com/graphrag

https://arxiv.org/abs/2501.00309
https://arxiv.org/abs/2307.06917
```

## 15-3. LLM Knowledge Graph 벤치마크

```
https://github.com/AKSW/LLM-KG-Bench
https://arxiv.org/abs/2308.16622
```

LLM이 RDF·SPARQL·지식 그래프 작업을 얼마나 정확하게 수행하는지 평가할 때 관련성이 큽니다. 2026년에는 LLM-KG-Bench Framework 3 연구도 공개되었습니다. 

## 15-4. 최신 Prompt·Agent Graph 연구

```
https://arxiv.org/abs/2607.27578
https://arxiv.org/abs/2607.27942
https://arxiv.org/abs/2607.01640
https://arxiv.org/abs/2603.06007
https://arxiv.org/abs/2605.14968
https://arxiv.org/abs/2605.22566
```

------

# 16. 계속 새 프로젝트를 찾기 위한 검색 주소

Graph Engineering은 빠르게 변하는 영역이므로 고정 목록만 보지 말고 다음 검색 주소도 함께 사용하는 것이 좋습니다.

```
https://github.com/search?q=%22graph+engineering%22&type=repositories
https://github.com/search?q=%22prompt+graph+engineering%22&type=repositories
https://github.com/search?q=code+graph+mcp&type=repositories
https://github.com/search?q=knowledge+graph+mcp&type=repositories
https://github.com/search?q=graphrag+mcp&type=repositories
https://github.com/search?q=agent+workflow+graph&type=repositories

https://github.com/topics/knowledge-graph
https://github.com/topics/graphrag
https://github.com/topics/graph-database
https://github.com/topics/graph-neural-networks
https://github.com/topics/mcp-server

https://registry.modelcontextprotocol.io/

https://arxiv.org/search/?query=%22graph+engineering%22&searchtype=all
https://arxiv.org/search/?query=%22agent+graph%22&searchtype=all
https://arxiv.org/search/?query=%22GraphRAG%22&searchtype=all
```

------

# 17. 사용자 목적별 가장 강력한 추천 조합

## 17-1. Claude Code 안에서 바로 시작

```
Graph Engineering Skill
+ Claude Subagents
+ Hooks
+ GitNexus
+ Neo4j MCP 또는 MemoryGraph
+ Mermaid
```

주소:

```
https://github.com/codejunkie99/graph-engineering
https://code.claude.com/docs/en/sub-agents
https://code.claude.com/docs/en/hooks
https://github.com/nxpatterns/gitnexus
https://github.com/neo4j/mcp
https://github.com/memory-graph/memory-graph
https://github.com/mermaid-js/mermaid
```

## 17-2. Codex 중심 코드베이스 Graph

```
AGENTS.md
+ Codex Skills
+ GitNexus 또는 CodeGraph
+ Neo4j/FalkorDB MCP
+ OpenTelemetry
```

주소:

```
https://developers.openai.com/codex/guides/agents-md
https://learn.chatgpt.com/docs/build-skills
https://github.com/nxpatterns/gitnexus
https://github.com/colbymchenry/codegraph
https://github.com/neo4j/mcp
https://github.com/FalkorDB/FalkorDB-MCPServer
https://github.com/open-telemetry/semantic-conventions-genai
```

## 17-3. Python 기반 운영용 Agent Graph

```
LangGraph 또는 Pydantic Graph
+ OpenAI Agents SDK
+ Graphiti 또는 Neo4j GraphRAG
+ pySHACL
+ Phoenix 또는 Langfuse
```

주소:

```
https://github.com/langchain-ai/langgraph
https://ai.pydantic.dev/graph/
https://github.com/openai/openai-agents-python
https://github.com/getzep/graphiti
https://github.com/neo4j/neo4j-graphrag-python
https://github.com/RDFLib/pySHACL
https://github.com/Arize-ai/phoenix
https://github.com/langfuse/langfuse
```

## 17-4. TypeScript 기반 운영용 Agent Graph

```
Mastra
+ Neo4j·FalkorDB·Memgraph
+ Cytoscape.js
+ OpenTelemetry
```

주소:

```
https://github.com/mastra-ai/mastra
https://github.com/neo4j/mcp
https://github.com/FalkorDB/FalkorDB-MCPServer
https://github.com/memgraph/mcp-memgraph
https://github.com/cytoscape/cytoscape.js
https://github.com/open-telemetry/semantic-conventions-genai
```

## 17-5. 비개발자에게 시각적으로 보여주는 Graph

```
Dify 또는 Flowise 또는 Langflow
+ Mermaid
+ Cytoscape.js
+ Gephi
```

주소:

```
https://github.com/langgenius/dify
https://github.com/FlowiseAI/Flowise
https://github.com/langflow-ai/langflow
https://github.com/mermaid-js/mermaid
https://github.com/cytoscape/cytoscape.js
https://github.com/gephi/gephi
```

------

# 18. 조건부·주의·제외 대상

## 18-1. Microsoft Prompt Flow

```
https://github.com/microsoft/promptflow
```

기능 개발이 종료되었으므로 신규 프로젝트의 중심 Graph 런타임으로는 제외하고, 기존 시스템 분석·마이그레이션 용도로만 검토하는 것이 좋습니다. 

## 18-2. Microsoft AutoGen

```
https://github.com/microsoft/autogen
```

완전히 사용할 수 없다는 뜻은 아니지만, Microsoft가 신규 Agent Framework로 방향을 이동했으므로 신규 장기 프로젝트는 비교 검토가 필요합니다. 

## 18-3. Graphiti 구버전

```
https://github.com/getzep/graphiti
```

과거 특정 구버전에서 Cypher Injection 관련 문제가 보고되었으므로 최신 패치 버전으로 고정하고, 외부 입력이 그대로 Cypher 쿼리로 이어지지 않도록 해야 합니다. 

## 18-4. Kuzu 기반 신규 구성

Graphiti 문서에서는 Kuzu 백엔드가 상위 프로젝트 유지보수 문제로 사용 중단 방향에 놓였으므로, 신규 구성은 Neo4j·FalkorDB·Memgraph 등을 우선 검토하는 것이 안전합니다. 

## 18-5. `neo4j-genai`

```
https://github.com/neo4j/neo4j-genai-python
```

신규 프로젝트는 다음 패키지를 우선해야 합니다.

```
https://github.com/neo4j/neo4j-graphrag-python
```

## 18-6. 자동 설정 수정 도구

GitNexus, CodeGraph, Codebase Memory MCP 같은 도구는 편리하지만 일부 설치 방식은 다음 파일을 자동 생성·수정할 수 있습니다.

- `CLAUDE.md`
- `AGENTS.md`
- `.claude/settings.json`
- `~/.codex/config.toml`
- MCP 설정
- 자동 승인 정책

따라서 설치 전에 반드시 다음을 적용해야 합니다.

```
git status
git diff
```

가능하다면 먼저 출력만 확인하는 옵션, 프로젝트 로컬 설치, 읽기 전용 모드를 사용해야 합니다.

## 18-7. Graph DB 쓰기 MCP

초기에는 반드시 다음 원칙을 적용해야 합니다.

- 읽기 전용 계정
- 최소 권한
- 별도 개발 DB
- 삭제·DDL 도구 비활성화
- 승인 필요
- Query Timeout
- 결과 행 수 제한
- 비밀정보 제외
- Audit Log
- 운영 DB 직접 연결 금지

MCP 도구 수가 지나치게 많아지면 모델의 도구 선택 정확도와 컨텍스트 효율이 떨어질 수 있으므로, 프로젝트별로 필요한 MCP와 도구만 활성화해야 합니다. 

------

# 19. 최종 추천 URL만 압축

## 반드시 먼저 볼 핵심

```
https://github.com/codejunkie99/graph-engineering

https://code.claude.com/docs/en/sub-agents
https://code.claude.com/docs/en/agent-teams
https://code.claude.com/docs/en/hooks
https://code.claude.com/docs/en/agent-sdk/overview

https://developers.openai.com/codex/guides/agents-md
https://learn.chatgpt.com/docs/build-skills
https://learn.chatgpt.com/docs/extend/mcp?surface=cli
https://github.com/openai/openai-agents-python

https://agentskills.io/
https://agents.md/
https://modelcontextprotocol.io/
```

## Agent·Task Graph

```
https://github.com/langchain-ai/langgraph
https://ai.pydantic.dev/graph/
https://github.com/microsoft/agent-framework
https://adk.dev/graphs/
https://github.com/strands-agents/sdk-python
https://github.com/mastra-ai/mastra
https://github.com/crewAIInc/crewAI
```

## Code Graph

```
https://github.com/nxpatterns/gitnexus
https://github.com/colbymchenry/codegraph
https://github.com/DeusData/codebase-memory-mcp
https://github.com/CodeGraphContext/CodeGraphContext
https://github.com/Graphify-Labs/graphify
https://github.com/joernio/joern
```

## Knowledge Graph·GraphRAG·Memory

```
https://github.com/microsoft/graphrag
https://github.com/neo4j/neo4j-graphrag-python
https://github.com/getzep/graphiti
https://github.com/topoteretes/cognee
https://github.com/memory-graph/memory-graph
https://github.com/HKUDS/LightRAG
https://github.com/HKUDS/RAG-Anything
https://github.com/OSU-NLP-Group/HippoRAG
https://github.com/OpenSPG/KAG
```

## Graph Database MCP

```
https://github.com/neo4j/mcp
https://github.com/FalkorDB/FalkorDB-MCPServer
https://github.com/memgraph/mcp-memgraph
https://awslabs.github.io/mcp/servers/amazon-neptune-mcp-server
https://docs.arango.ai/ecosystem/arangodb-mcp-server/
```

## 검증·분석·시각화

```
https://github.com/RDFLib/pySHACL
https://github.com/networkx/networkx
https://github.com/mermaid-js/mermaid
https://github.com/cytoscape/cytoscape.js
https://github.com/gephi/gephi
https://github.com/Arize-ai/phoenix
https://github.com/langfuse/langfuse
https://github.com/open-telemetry/semantic-conventions-genai
```
