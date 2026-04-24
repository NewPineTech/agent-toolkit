# Discovery Report: RAGFlow Chat Widget Toolkit

## Architecture Snapshot

- **Greenfield project** — empty repo, no existing code
- **Monorepo** with 3 packages: `packages/server`, `packages/widget`, `packages/types`
- **Backend**: Fastify + PostgreSQL, adapter/factory patterns everywhere
- **Widget**: React npm package (headless hook + default UI)
- **Requirements & Decisions**: fully documented in `.ccu/REQUIREMENTS.md` and `.ccu/DECISIONS.md`

## Existing Patterns (from similar projects)

| Project | Pattern | Relevance |
|---------|---------|-----------|
| @assistant-ui/react | Provider-Runtime-UI composition, headless primitives | Widget architecture model |
| Vercel AI SDK | SSE stream protocol, async generators, Readable streams | Streaming pattern |
| Chatwoot | Polymorphic channel architecture, iframe widget SDK, Postgres+Redis | Multi-tenant SaaS widget model |
| Fastify ecosystem | @fastify/awilix for DI, @fastify/sse for streaming | DI + streaming approach |

## Technical Constraints & Recommendations

### Monorepo Structure
```
packages/
  server/        # Fastify backend (Node target)
  widget/        # React npm package (DOM target)  
  types/         # Shared DTOs and domain types
pnpm-workspace.yaml
tsconfig.base.json
```
- **Tooling**: pnpm workspaces (simple, no turborepo needed for 2-3 packages)
- **Widget bundling**: tsup (--format cjs,esm --dts)
- **Server dev**: tsx, production: tsc

### Key Dependencies

| Layer | Package | Reason |
|-------|---------|--------|
| HTTP | `fastify` | Chosen framework |
| SSE | `@fastify/sse` | Auto-handles SSE headers/encoding |
| CORS | `@fastify/cors` | Per-workspace domain allowlist |
| Rate limit | `@fastify/rate-limit` | In-memory for MVP |
| JWT | `jose` | Zero-dependency, modern JWT lib |
| ORM | `drizzle-orm` + `drizzle-kit` | Code-first, excellent TS types, fits adapter pattern |
| DI | `@fastify/awilix` + `awilix` | Official Fastify DI plugin, app/request scope |
| Logging | `pino` (built into Fastify) | Adapter wraps Fastify's built-in logger |
| Encryption | Node `crypto` (AES-256-GCM) | API key encryption at rest |
| Widget SSE | `event-source-polyfill` | Browser EventSource compatibility |

### DI Approach: @fastify/awilix
- **App scope (SINGLETON)**: ChatProviderFactory, SessionStore, EncryptionService, Logger
- **Request scope (SCOPED)**: per-request session, rate limiter state
- Routes access deps via `request.diScope.cradle`
- Aligns perfectly with the mandatory adapter+factory pattern

### Streaming Approach
1. Client POST `/widget/chat` with JWT + message
2. Fastify handler maps session → RAGFlow session_id
3. Proxy RAGFlow SSE stream via `reply.sse()` 
4. Widget `useRagflowChat` hook consumes via native `EventSource`
5. Tokens render incrementally

## External References

- Vercel AI SDK Stream Protocol: ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
- @fastify/awilix: github.com/fastify/fastify-awilix
- Drizzle ORM: orm.drizzle.team
- @fastify/sse: npmjs.com/package/@fastify/sse
