# Approach: Production LangGraph Runtime Provider

## Chosen Architecture

Use LangGraph as a runtime package behind the existing chat provider seam.

```text
Widget
  -> Server auth/session/domain/rate-limit
  -> ChatProviderFactory
  -> LangGraphAdapter
  -> @agent-toolkit/langgraph runtime
  -> Gemini 2.5 Flash Lite + tools/retrievers
  -> Server maps runtime events to ChatStreamEvent SSE
```

This keeps public API and widget behavior stable while allowing LangGraph to handle workflow, state, tools, policy, verification, and confirmation.

## Package Boundary

### `@agent-toolkit/langgraph`

Runtime only. It must not import server-only concepts such as Fastify, workspace DB rows, JWT, Redis app wiring, encryption service, request objects, or route handlers.

Responsibilities:

- state schema,
- graph construction,
- nodes,
- runtime events,
- Gemini client,
- retriever interfaces and RAGFlow retriever implementation,
- tool registry interfaces,
- policy engine,
- verification,
- confirmation event support,
- audit event shape,
- public `createLangGraphRuntime(...)` API.

### `packages/server`

Integration and security boundary.

Responsibilities:

- `ProviderType.LANGGRAPH`,
- `LangGraphAdapter implements ChatProvider`,
- decrypt workspace key,
- read `GEMINI_API_KEY`,
- parse workspace `provider_config`,
- instantiate Gemini client/retriever/tools/policy/audit/checkpoint dependencies,
- map runtime events to existing `ChatStreamEvent`,
- return clean errors through the existing SSE provider contract.

## Runtime Public API

```ts
createLangGraphRuntime({
  model,
  retriever,
  tools,
  policyEngine,
  auditSink,
  checkpointer,
  systemPrompt,
});
```

Runtime input:

```ts
{
  sessionId,
  requestId,
  userContext,
  messages,
  providerConfig,
}
```

Runtime output is an async generator of typed runtime events.

## State Model

State should group workflow data by responsibility:

```text
messages
userContext
requestContext
route
capability
retrievalContext
toolPlan
toolArgs
toolResult
toolError
policyDecision
confirmation
verification
retry
auditEvents
finalAnswer
```

The graph state is the workflow source of truth. Important decisions must not live only inside prompts.

## Graph Structure

Production baseline graph:

```text
START
  -> load_context
  -> route_request
  -> conditional:
       knowledge_qa
       tool_action
       clarification
       unsupported
  -> verify_result
  -> generate_response
  -> END
```

Sensitive action graph:

```text
prepare_action_plan
  -> policy_check
  -> confirmation_required
  -> resume_after_confirmation
  -> execute_tool
  -> verify_result
  -> generate_response
```

## Tool Registry

Tools are capability-based, not intent-agent based.

Required registry metadata:

```text
name
description
inputSchema
outputSchema
riskLevel
requiredPermissions
requiresConfirmation
timeoutMs
retryPolicy
auditRequired
execute
```

Initial production capabilities:

- `docs.search` through RAGFlow retrieval,
- `ticket.create` as confirmation-required workflow shape,
- `internal.lookup_readonly` interface shape for future read-only APIs.

If a concrete external ticket/internal API is not available during implementation, the workflow must still be real and explicit: unsupported/unconfigured tools produce typed errors instead of fake success.

## Policy And Verification

Policy is deterministic and runs before tool execution:

- permission check,
- input schema validation,
- risk evaluation,
- confirmation requirement,
- rate/quota hook,
- audit requirement,
- sensitive-data guard hook.

Verification is deterministic and runs after retrieval/tool/model stages:

- required fields,
- result status,
- no destructive action without confirmation,
- retry eligibility,
- no final answer claiming tool success when tool failed.

## Config

LangGraph workspace config:

```json
{
  "model": {
    "provider": "gemini",
    "model": "gemini-2.5-flash-lite"
  },
  "ragflow": {
    "baseUrl": "https://ragflow.example.com",
    "datasetIds": ["kb_x"],
    "topK": 5,
    "similarityThreshold": 0.2
  },
  "tools": {
    "enabled": ["docs.search"]
  },
  "memory": {
    "shortTerm": true,
    "longTerm": false
  },
  "systemPrompt": "..."
}
```

Validation rules:

- model provider must be `gemini`,
- model must be `gemini-2.5-flash-lite`,
- reject secret-like keys anywhere in `provider_config`,
- require RAGFlow config when retrieval tools are enabled,
- default to safe read-only tools only,
- no implicit write tools.

## Risk Map

High-risk areas:

- server/runtime secret boundary,
- Gemini streaming parser,
- human confirmation and resume semantics,
- side-effecting tool execution,
- mapping richer runtime events to existing SSE events,
- preventing stubbed/fake tool success paths.

Mitigations:

- strict config parser tests,
- adapter tests for missing env and event mapping,
- policy tests for permissions and confirmation,
- verification tests for failed tool result,
- no production mocks or TODOs,
- smoke test through `/widget/chat` once wired.
