# Discovery: Production LangGraph Runtime Provider

## Objective

Build LangGraph as a real production feature in `agent-toolkit`.

The agreed boundary is:

- `@agent-toolkit/langgraph` is a runtime-only package.
- `packages/server` owns the `langgraph` chat provider integration.
- Gemini is the generation model provider, fixed to `gemini-2.5-flash-lite`.
- RAGFlow remains a retrieval capability when configured, not the top-level chat provider for LangGraph workspaces.

This is not an MVP, prototype, or spike. Planning and implementation must complete the feature to production quality for the agreed scope.

## Existing Project Shape

The monorepo is package-based:

- `packages/server`: Fastify backend, provider adapters, workspace/session/security boundaries.
- `packages/types`: shared enums and DTOs.
- `packages/core`: runtime-independent helpers for validation, encryption, provider URLs, and widget helpers.
- `packages/widget`: browser widget and SSE consumer.
- `packages/cli`: workspace/provider management commands.
- `packages/langgraph`: previously existed but source was removed in the current checkout.

Current provider seam:

```text
/widget/chat
  -> ChatProviderFactory
  -> ChatProvider adapter
  -> ChatStreamEvent SSE
```

The LangGraph feature must preserve this seam so the widget contract stays stable.

## External Runtime Constraints

LangGraph should be used as the stateful workflow runtime. It should own graph state, node transitions, runtime events, tool orchestration, verification, and human confirmation hooks.

Gemini usage must follow the server-owned secret boundary:

- `GEMINI_API_KEY` is read from server environment.
- Gemini API key is never stored in `provider_config`.
- Gemini API key is never stored as `provider_api_key`.
- Gemini API key transport must use `x-goog-api-key`, not URL query parameters.

Workspace semantics:

```text
provider_type = "langgraph"
provider_api_key = encrypted retrieval/provider key, for example RAGFlow retrieval key
provider_config = non-secret JSON config for runtime behavior
```

## Feature Requirements

The production feature must include:

- Runtime package skeleton and public API.
- Typed config parsing and strict validation.
- State schema and runtime event contract.
- Gemini `gemini-2.5-flash-lite` streaming client.
- RAGFlow retriever capability.
- Capability-based tool registry.
- Deterministic policy engine.
- Deterministic verification layer.
- Human confirmation flow for sensitive actions.
- Server `LangGraphAdapter`.
- Provider factory wiring.
- Env/config support.
- CLI/docs/deployment updates.
- Comprehensive focused tests and workspace validation.

## Quality Bar

No core feature can be represented by placeholder code. Production code must not include TODOs, stubs, mock implementations, skipped tests, or fake success paths.

Every task must include:

- happy path behavior,
- error handling,
- config validation,
- tests,
- docs when user-visible,
- security boundary checks when secrets/tools/actions are involved.
