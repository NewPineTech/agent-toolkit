# Execution Plan: agent-toolkit-2c9 LangGraph Expansion

## Objective

Complete the entire LangGraph expansion in this round. No partial/foundation-only finish is acceptable. The final state must support multi-turn session memory, natural free chat, RAG Q&A, complex analysis, planner/executor flow, ai-recruitment MCP tools, and response planning for markdown/references/chart/image artifacts within LangGraph plus required server wiring. Widget UI rendering is tracked separately in agent-toolkit-1ny and must not be edited here.

## Constraints

- Primary scope: `packages/langgraph`.
- Required server wiring is allowed after impact notice: `packages/server` env/config/adapter/session storage path.
- No widget edits in this epic.
- Gemini model remains `gemini-2.5-flash-lite`.
- Gemini secret remains server env only.
- MCP runtime must be app-owned HTTP client, not Codex global tool runtime.
- ai-recruitment MCP currently exists in local Codex config at `http://localhost:3000/api/v1/mcp` with bearer env `MCP_AUTH_TOKEN`, but app implementation must use its own env names.

## Tracks

### Track A: Prompt Registry and Contracts

Bead: agent-toolkit-2c9.1
Files: `packages/langgraph/src/prompts/**`, Gemini client tests.
Deliverables:

- Router, planner, answer, tool selection, verification, response-format prompt builders.
- Typed prompt input contracts.
- Prompt tests that lock required JSON/markdown/reference/artifact rules.

### Track B: Memory and Routing

Beads: agent-toolkit-2c9.2, agent-toolkit-2c9.3
Files: `packages/langgraph/src/state.ts`, `runtime.ts`, `graph/**`, `nodes/**`, `memory/**`.
Deliverables:

- Multi-turn messages and optional summary/window memory.
- Routes: `free_chat`, `knowledge_qa`, `complex_analysis`, `tool_task`, `clarification`, `unsupported`.
- Free chat does not require retriever; knowledge route still requires retriever.

### Track C: Planner, Tool Execution, MCP

Beads: agent-toolkit-2c9.4, agent-toolkit-2c9.5
Files: `packages/langgraph/src/planner/**`, `tools/**`, `mcp/**`, nodes/tests.
Deliverables:

- Strict JSON planner output parsing.
- Multi-step read-only execution and partial failure representation.
- MCP HTTP client: initialize, tools/list, tools/call, auth, timeout, schema cache.
- ai-recruitment MCP adapter mapped into LangGraph capabilities.

### Track D: Response Planning and Server Wiring

Beads: agent-toolkit-2c9.6, agent-toolkit-2c9.7
Files: `packages/langgraph/src/events.ts`, response metadata, `packages/server/src/adapters/chat/langgraph.adapter.ts`, server env/config tests.
Deliverables:

- Runtime metadata for markdown/references/chart/image artifacts without widget render changes.
- Server passes session history and stores user/assistant messages.
- Server injects MCP URL/token env into LangGraph adapter.
- Existing Ragflow provider path unaffected.

## Validation Gate

- `pnpm --filter @agent-toolkit/langgraph run test`
- `pnpm --filter @agent-toolkit/langgraph run typecheck`
- focused server tests for LangGraph adapter/session memory
- `pnpm --filter @agent-toolkit/server run test`
- `pnpm test`
- `pnpm -r run typecheck`
- `pnpm build`
- `pnpm format:check`
- `git diff --check`
- scan for TODO/FIXME/stub/placeholder/fake success/skipped tests in changed production files
- verify no widget files changed for this epic

## Orchestration

Use worker subagents for independent code review or targeted implementation only where file scopes do not conflict. Because the worktree already contains a large uncommitted LangGraph implementation, root agent keeps final integration ownership and validates all changes before closing beads.
