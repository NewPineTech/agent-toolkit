# Agentic LangGraph Runtime

`packages/agentic` is the first-party LangGraph runtime for the HR assistant.
It is separate from `packages/server`: the server still owns widget sessions,
workspace auth, rate limits, encrypted provider keys, and SSE proxying.

## Local Development

Run the Agent Toolkit server as usual:

```bash
pnpm dev
```

Run the Agentic HTTP runtime for server-to-provider calls:

```bash
PORT=2024 pnpm --filter @agent-toolkit/agentic exec tsx src/server.ts
```

Run LangGraph Studio against the graph exports:

```bash
pnpm --filter @agent-toolkit/agentic run dev
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

The `hr_recruitment` subgraph can also call the optional `ai-recruitment` MCP
server for recruitment user-guide context before falling back to local
recruitment notes:

| Variable                          | Purpose                                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_RECRUITMENT_MCP_AUTH_TOKEN`   | Bearer token for the MCP server. If empty, `MCP_AUTH_TOKEN` is used as a fallback.                                                                            |
| `AI_RECRUITMENT_MCP_URL`          | Streamable HTTP MCP endpoint, for example `http://localhost:3000/api/v1/mcp` from host or `http://host.docker.internal:3000/api/v1/mcp` from Docker on macOS. |
| `AI_RECRUITMENT_MCP_SEARCH_LIMIT` | Optional search result limit. Defaults to `3`.                                                                                                                |
| `AI_RECRUITMENT_MCP_TIMEOUT_MS`   | Optional MCP request timeout. Defaults to `4000`.                                                                                                             |

Codex global MCP config is a developer convenience; it is not automatically
available inside the Agentic runtime or Docker containers. Mirror the same URL
and token into the runtime environment when the graph should call that MCP.

Non-secret graph topology, prompt files, retriever defaults, and memory defaults
live in source under `packages/agentic`.

## Verification

```bash
pnpm --filter @agent-toolkit/agentic run test
pnpm --filter @agent-toolkit/agentic run typecheck
pnpm --filter @agent-toolkit/agentic run build
pnpm --filter @agent-toolkit/server run test
pnpm --filter @agent-toolkit/server run typecheck
docker compose config
```
