# Execution Plan: Production LangGraph Runtime Provider

## Epic

Production LangGraph runtime provider.

Beads epic: `agent-toolkit-34h`

This is a real feature, not an MVP. Every worker must treat incomplete core behavior as a blocker. Do not land placeholders, TODOs, skipped tests, fake tool success, or mock implementations in production files.

## Orchestrator Rules

- Treat `agent-toolkit-34h` as the container epic, not a worker task. The first implementation worker should claim `agent-toolkit-34h.1`.
- Keep `@agent-toolkit/langgraph` runtime-only.
- Keep `packages/server` as provider integration and security boundary.
- Keep Gemini fixed to `gemini-2.5-flash-lite`.
- Keep `GEMINI_API_KEY` server-env only.
- Keep `provider_config` secret-free.
- Preserve existing `/widget/chat` and `ChatStreamEvent` contract unless a deliberate compatibility update is documented and tested.
- Each track must include focused tests and update docs for user-visible behavior.

## Track 1: Runtime Foundation

Bead: `agent-toolkit-34h.1`

Agent scope:

```text
packages/langgraph/package.json
packages/langgraph/tsconfig.json
packages/langgraph/src/index.ts
packages/langgraph/src/config.ts
packages/langgraph/src/state.ts
packages/langgraph/src/events.ts
packages/langgraph/src/runtime.ts
packages/langgraph/src/graph/build-graph.ts
packages/langgraph/src/nodes/*
```

Deliverables:

- Create `@agent-toolkit/langgraph` as workspace package.
- Define runtime public API.
- Define state and event contracts.
- Build production graph with routing, knowledge QA, tool action, clarification, unsupported, verification, and response path.
- Add unit tests for graph flow and runtime events.

Dependencies:

- None.

Acceptance criteria:

- Runtime compiles standalone.
- Graph returns typed runtime events.
- No server imports.
- Tests cover route and error paths.

## Track 2: Gemini And Retrieval

Bead: `agent-toolkit-34h.3`

Agent scope:

```text
packages/langgraph/src/model/gemini.client.ts
packages/langgraph/src/retrieval/ragflow-retriever.ts
packages/langgraph/src/config.ts
packages/langgraph/src/model/*.test.ts
packages/langgraph/src/retrieval/*.test.ts
```

Deliverables:

- Implement Gemini streaming client.
- Validate fixed model `gemini-2.5-flash-lite`.
- Use `x-goog-api-key`.
- Implement RAGFlow retrieval capability.
- Normalize retrieval chunks.
- Add parser and failure tests.

Dependencies:

- Track 1 config/event contracts.

Acceptance criteria:

- Gemini key never appears in URL.
- Unsupported model is rejected.
- Retrieval errors become typed runtime/provider errors.
- Tests cover SSE chunks, malformed payloads, and failed HTTP responses.

## Track 3: Tools, Policy, Verification, Confirmation

Bead: `agent-toolkit-34h.4`

Agent scope:

```text
packages/langgraph/src/tools/*
packages/langgraph/src/policy/*
packages/langgraph/src/verification/*
packages/langgraph/src/confirmation/*
packages/langgraph/src/nodes/*
```

Deliverables:

- Implement capability-based tool registry.
- Implement deterministic policy engine.
- Implement deterministic verification layer.
- Implement confirmation-required runtime event flow for sensitive actions.
- Define retry policy behavior and non-retryable failures.
- Add tests for permission block, schema failure, confirmation required, failed tool result, and unsupported tool.

Dependencies:

- Track 1 state/event contracts.

Acceptance criteria:

- Medium/high-risk tools cannot execute without confirmation.
- Missing permissions block execution.
- Invalid tool args block execution.
- Failed tool result is not reported as success.
- Unconfigured tools do not fake success.

## Track 4: Server Provider Integration

Bead: `agent-toolkit-34h.2`

Agent scope:

```text
packages/types/src/enums.ts
packages/server/src/config/env.ts
packages/server/src/interfaces/chat-provider.interface.ts
packages/server/src/adapters/chat/langgraph.adapter.ts
packages/server/src/factories/chat-provider.factory.ts
packages/server/src/app.ts
packages/server/src/adapters/chat/*.test.ts
packages/server/src/factories/*.test.ts
```

Deliverables:

- Add `ProviderType.LANGGRAPH`.
- Add `LangGraphAdapter implements ChatProvider`.
- Inject `GEMINI_API_KEY`.
- Parse `workspace.providerConfig`.
- Decrypt workspace provider key only for retrieval/provider secret.
- Instantiate runtime dependencies.
- Map runtime events to `ChatStreamEvent`.
- Add missing-env and event-mapping tests.

Dependencies:

- Tracks 1 and 2 runtime APIs.

Acceptance criteria:

- Existing RAGFlow provider tests still pass.
- LangGraph provider streams through existing `/widget/chat` path.
- Missing `GEMINI_API_KEY` returns clean provider error.
- `provider_config` secrets are rejected or redacted according to existing patterns.

## Track 5: CLI, Docs, Deployment

Bead: `agent-toolkit-34h.5`

Agent scope:

```text
packages/cli/src/commands/*
README.md
DEPLOYMENT.md
Dockerfile
Dockerfile.storybook
package.json
pnpm-workspace.yaml
```

Deliverables:

- Add user-facing LangGraph workspace examples.
- Add `GEMINI_API_KEY` docs.
- Add provider config examples.
- Ensure Docker build order includes `packages/langgraph`.
- Add CLI validation/redaction for LangGraph provider config.
- Keep docs aligned with actual behavior.

Dependencies:

- Track 4 config semantics.

Acceptance criteria:

- Docs clearly state LangGraph is runtime and server owns provider integration.
- Docs clearly state Gemini model is `gemini-2.5-flash-lite`.
- Docs clearly state secrets boundary.
- CLI examples are executable against the implemented command surface.

## Track 6: Cross-Track Validation And Production Sweep

Bead: `agent-toolkit-34h.6`

Agent scope:

```text
whole repository
```

Deliverables:

- Run focused package tests.
- Run full typecheck/test/build/format checks.
- Inspect production code for placeholders, TODOs, skipped tests, fake tool success, and non-test mocks.
- Verify event compatibility with widget.
- Verify docs match implementation.

Dependencies:

- Tracks 1 through 5.

Acceptance criteria:

```bash
pnpm --filter @agent-toolkit/langgraph run test
pnpm --filter @agent-toolkit/langgraph run typecheck
pnpm --filter @agent-toolkit/server run test
pnpm --filter @agent-toolkit/server run typecheck
pnpm -r run typecheck
pnpm -r run test
pnpm build
pnpm format:check
git diff --check
```

All must pass, or failures must be documented as external blockers.

## Dependency Graph

```text
Track 1 Runtime Foundation
  -> Track 2 Gemini And Retrieval
  -> Track 4 Server Provider Integration
  -> Track 5 CLI, Docs, Deployment
  -> Track 6 Cross-Track Validation

Track 1 Runtime Foundation
  -> Track 3 Tools, Policy, Verification, Confirmation
  -> Track 4 Server Provider Integration
  -> Track 6 Cross-Track Validation
```

## Parallelization

Start in parallel:

- Track 1 can start immediately.
- Track 3 can start after Track 1 publishes state/event contracts.
- Track 2 can start after Track 1 publishes config/event contracts.

Then:

- Track 4 starts after stable runtime APIs from Tracks 1 and 2.
- Track 5 starts after Track 4 config semantics are stable.
- Track 6 starts after all implementation tracks complete.
