# Agentic LangGraph Runtime

`packages/agentic` is the first-party LangGraph runtime for the HR assistant.
It is separate from `packages/server`: the server still owns widget sessions,
workspace auth, rate limits, encrypted provider keys, and SSE proxying.

## Local Development

Run the full local stack when you want the server, Agentic runtime, and Studio
API together:

```bash
pnpm dev
```

Run individual processes when you only need one role:

```bash
pnpm dev:server      # Fastify widget/session/SSE proxy
pnpm dev:langgraph   # Agentic HTTP /chat runtime on port 2024
pnpm dev:langstudio  # LangGraph Studio dev API on port 2025
```

The Studio command starts a LangGraph dev API and prints a Studio URL. The
`packages/agentic/langgraph.json` file exposes four graph IDs:

- `hr_assistant`
- `free_chat`
- `hr_knowledge_qa`
- `hr_recruitment`

## Docker

The compose files expose two Agentic services:

| Service      | Purpose                                          | Port                       |
| ------------ | ------------------------------------------------ | -------------------------- |
| `langgraph`  | Server-facing Agentic `/chat` provider runtime   | `${LANGGRAPH_PORT:-2024}`  |
| `langstudio` | LangGraph Studio dev API for graph visualization | `${LANGSTUDIO_PORT:-2025}` |

Both compose files expect `.env.prod` for container secrets and port settings.
Copy `.env.prod.example` to `.env.prod` before running Docker commands.

Start only the Agentic runtime:

```bash
docker compose up --build langgraph
```

Start the Studio dev API:

```bash
docker compose up --build langstudio
```

After changing the Dockerfile or LangGraph package dependencies, recreate the
Studio service so Docker Compose does not keep running an older container:

```bash
docker compose up -d --build --force-recreate langstudio
```

The Dockerfile has dedicated targets for each runtime role:

| Target            | Compose service | Command                                          |
| ----------------- | --------------- | ------------------------------------------------ |
| `server-runtime`  | `server`        | `node packages/server/dist/server.js`            |
| `agentic-runtime` | `langgraph`     | `node packages/agentic/dist/server.js`           |
| `agentic-studio`  | `langstudio`    | `langgraphjs dev --config langgraph.docker.json` |

For Studio, open:

```text
https://smith.langchain.com/studio?baseUrl=http://localhost:2025
```

The Docker Studio service uses `packages/agentic/langgraph.docker.json`. It
points at source graph exports so Studio can statically extract graph schemas
and show the default test input. The server-facing `langgraph` runtime still
executes the built `dist` server.

## Workspace Provider Settings

To route widget chat through the Agentic runtime, create or update a workspace
with:

| Field               | Value                                                                           |
| ------------------- | ------------------------------------------------------------------------------- |
| `provider_type`     | `langgraph`                                                                     |
| `provider_agent_id` | `hr_assistant`                                                                  |
| `provider_base_url` | `http://langgraph:2024` inside Docker, or `http://localhost:2024` from the host |
| `provider_api_key`  | Any non-empty shared value until provider-side auth is enabled                  |

The server adapter calls `POST /chat` on the configured `provider_base_url` and
forwards the existing widget SSE contract (`token`, `metadata`, `error`,
`done`).

## Environment

`GEMINI_VERTEX_API_KEY` is the Agentic model secret. If it is empty, the model
wrapper degrades to deterministic fallback behavior so local tests and Docker
smoke checks still run.

`RAGFLOW_API_KEY` enables the HR document retriever used by
`hr_knowledge_qa`. If it is empty or the retriever is unavailable, the graph
keeps the chat flow alive and emits warnings such as `HR_RETRIEVER_EMPTY` or
`HR_RETRIEVER_UNAVAILABLE:*` instead of crashing.

The `hr_recruitment` subgraph can also call the optional `ai-recruitment` MCP
server for recruitment user-guide context before falling back to local
recruitment notes:

| Variable                        | Purpose                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `AI_RECRUITMENT_MCP_AUTH_TOKEN` | Bearer token for the MCP server. If empty, `MCP_AUTH_TOKEN` is used as a fallback. |

Codex global MCP config is a developer convenience; it is not automatically
available inside the Agentic runtime or Docker containers. Mirror the bearer
token into the runtime environment when the graph should call that MCP.

Non-secret MCP configuration lives in `AGENTIC_MCP_REGISTRY` in
`packages/agentic/src/constants.ts`. That registry owns the local and Docker
runtime endpoint targets, the default runtime target, protocol version, timeout,
search limit, maximum content length, allowed read-only guide tools, and usage
mode. Do not add URL, timeout, or result-limit overrides to `.env`; changing
those values is a source-controlled domain configuration change.

The current MCP usage mode is `retrieval_context`, implemented with a hybrid
plan-and-gate pattern. The graph performs a read-only lookup before model
generation by creating a code-owned MCP action plan, validating it against
`AGENTIC_MCP_REGISTRY`, initializing the Streamable HTTP MCP session through the
official MCP TypeScript SDK, verifying the selected tool through `tools/list`,
calling the authorized tool, marking returned content as untrusted retrieved
context, emitting sanitized audit metadata, and falling back to local
recruitment notes on failure. The deterministic guide planner can choose the
current read-only guide tools: `list_user_guide_pages`, `search_user_guide`,
`get_user_guide_page`, and `get_user_guide_section`.

Future write/action MCP tools must be added to the registry with
capability/approval metadata. A model may propose a structured MCP action plan,
but code must authorize it before execution. Read-only tools can execute
automatically; write/action tools must route through a LangGraph approval node
using `interrupt()` and resume only after approve/edit/reject handling is wired.

Non-secret graph topology, prompt files, retriever defaults, and memory defaults
live in source under `packages/agentic`. Prompt assets are Markdown files under
`packages/agentic/src/prompts/` and are copied into `dist` during
`pnpm --filter @agent-toolkit/agentic run build`; prompt behavior should be
covered by prompt-loader, router, or workflow tests.

## Capability Planner Readiness Gates

The Agentic runtime uses one assistant-level capability registry, grouped by
intent. Capabilities stay inside this HR assistant domain; this is not a
multi-domain plugin platform.

Suggest a `ToolNode` adapter when these conditions are true:

- Read-only capabilities have stable Zod input/output schemas.
- Capability execution already records structured evidence and tool-call audit
  rows.
- Golden evals cover tool choice, fallback behavior, missing evidence, and
  verifier regressions.
- The adapter can be introduced as `AgenticCapability -> StructuredTool ->
ToolNode` without changing widget streaming or memory behavior.

Do not route write/action MCP tools through `ToolNode` until the explicit
approval/resume HTTP contract is designed and implemented.

Suggest a Model-first planner only when deterministic rules become too brittle
for the active tool surface and all of these gates are met:

- Capability registry and schemas are stable.
- Tool budgets, timeouts, and denial behavior are code-owned.
- Verifier hard gates prevent unsupported, empty, or incomplete evidence from
  reaching answer generation.
- Golden evals show stable tool-choice quality for both HR Knowledge and
  Recruitment guide queries.
- Observability can distinguish planned, executed, skipped, failed, and repaired
  capability calls.

Until those gates are met, keep the current deterministic-first planner.
Ambiguous recruitment guide requests stay on safe search and mark model
assistance as useful later instead of executing model-selected multi-step plans.

## Verification

```bash
pnpm --filter @agent-toolkit/agentic run test
pnpm --filter @agent-toolkit/agentic run typecheck
pnpm --filter @agent-toolkit/agentic run build
pnpm --filter @agent-toolkit/server run test
pnpm --filter @agent-toolkit/server run typecheck
docker compose config
```
