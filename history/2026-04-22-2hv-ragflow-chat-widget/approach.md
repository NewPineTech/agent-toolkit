# Approach: RAGFlow Chat Widget Toolkit

Epic: TBD (will be assigned in Phase 4)
Generated: 2026-04-22

## Gap Analysis

| Component                       | Have       | Need                                                                                                            | Gap                                                  |
| ------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Monorepo setup                  | Empty repo | pnpm workspaces, 3 packages, tsconfig.base, tsup                                                                | Full scaffold                                        |
| Shared types (`packages/types`) | Nothing    | DTOs, SSE event types, error codes                                                                              | Define all API shapes                                |
| Interfaces (8)                  | Nothing    | ChatProvider, SessionStore, UsageTracker, RateLimiter, TokenService, EncryptionService, DomainValidator, Logger | Small files but foundational                         |
| Adapters (8)                    | Nothing    | Ragflow, Postgres×2, InMemory, JWT, AES, Allowlist, Pino                                                        | Bulk of server code; RagflowAdapter highest-effort   |
| Factories (5)                   | Nothing    | ChatProvider, Session, Token, Workspace, ErrorResponse                                                          | ChatProviderFactory most complex                     |
| DB schema                       | Nothing    | 3 tables: workspaces, sessions, usage (Drizzle)                                                                 | Schema + migrations + seed                           |
| Fastify server + DI             | Nothing    | createApp() with @fastify/awilix, plugin registration                                                           | Wire all adapters into container                     |
| Routes                          | Nothing    | POST /widget/session, POST /widget/chat                                                                         | Chat route is complex (auth + proxy + SSE)           |
| SSE streaming proxy             | Nothing    | Proxy RAGFlow SSE → client SSE                                                                                  | Backpressure, error mid-stream, connection lifecycle |
| Widget hook                     | Nothing    | useRagflowChat with fetch+ReadableStream (NOT EventSource)                                                      | ~200-300 LOC                                         |
| Widget UI                       | Nothing    | RagflowChatWidget with bubble, messages, input, theming                                                         | Presentational layer on hook                         |
| Security                        | Nothing    | AES-256-GCM, JWT, domain allowlist                                                                              | Standard patterns                                    |

## Recommended Approach

**Build order: bottom-up, interfaces-first, vertical validation early.**

### Phase 1 — Foundation (no runtime behavior)

Monorepo scaffold, shared types, all 8 interfaces. Unblocks parallel work.

### Phase 2 — Data layer

Drizzle schema (3 tables), migrations, EncryptionService, PostgresSessionStore, PostgresUsageTracker.

### Phase 3 — Server core

Fastify createApp() + awilix DI, security adapters (JWT, AES, Allowlist, Pino), all factories, route handlers. RagflowAdapter with SSE proxy is critical path.

### Phase 4 — Widget

useRagflowChat hook (fetch + ReadableStream, NOT EventSource), then RagflowChatWidget UI.

### Alternative Approaches

1. **API-contract-first (OpenAPI)**: Write OpenAPI spec first, generate types. PRO: parallel dev. CON: tooling overhead, spec drift. Best with 2+ devs.
2. **Vertical slice**: Build /widget/session end-to-end first to validate DI stack, then /widget/chat. PRO: validates architecture early. CON: delays the hard part (SSE streaming).

## Risk Map

| Component                               | Risk       | Reason                                                                   | Verification                                                           |
| --------------------------------------- | ---------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| RAGFlow SSE proxy                       | **HIGH**   | External API; SSE format undocumented; error/disconnect behavior unknown | **Spike required**: hit RAGFlow agent endpoint, capture raw SSE frames |
| Widget streaming (fetch+ReadableStream) | **MEDIUM** | EventSource is GET-only; POST SSE requires manual frame parsing          | Prototype fetch streaming cross-browser                                |
| @fastify/awilix DI                      | MEDIUM     | Less community examples than NestJS; scoping rules need care             | Integration test for request-scoped resolution                         |
| SSE Fastify → browser                   | MEDIUM     | Backpressure and reply.raw edge cases                                    | Load test with slow clients                                            |
| Multi-tenant workspace routing          | MEDIUM     | Every request resolves workspace config; N+1 risk                        | Cache workspace config with TTL                                        |
| Drizzle + Postgres                      | LOW        | Well-documented, standard pattern                                        | Unit test schema                                                       |
| JWT token management                    | LOW        | jose is mature, standard pattern                                         | Unit test sign/verify                                                  |
| AES-256-GCM encryption                  | LOW        | Node crypto built-in                                                     | Test encrypt/decrypt round-trip                                        |
| Domain allowlist CORS                   | LOW        | String comparison on Origin                                              | Test matching/non-matching                                             |

## Critical Design Correction

**EventSource cannot be used for POST requests.** The widget hook must use `fetch()` with `ReadableStream` and manually parse SSE frames (`data:` lines). This is a departure from the original architecture summary. The pattern:

```typescript
const response = await fetch("/widget/chat", { method: "POST", body, headers });
const reader = response.body.getReader();
const decoder = new TextDecoder();
// Parse SSE frames manually from chunks
```
