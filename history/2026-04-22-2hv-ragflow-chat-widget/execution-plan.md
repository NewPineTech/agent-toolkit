# Execution Plan: RAGFlow Chat Widget Toolkit

Epic: agent-toolkit-2hv
Generated: 2026-04-22

## Tracks

| Track | Agent | Beads (in order) | File Scope |
|-------|-------|-------------------|------------|
| 1 | BlueLake | .1 → .2 → .3 | `packages/types/**`, `packages/server/src/interfaces/**`, root configs |
| 2 | GreenCastle | .4 → .6 | `packages/server/src/db/**`, `packages/server/src/adapters/storage/**` |
| 3 | RedStone | .5 | `packages/server/src/adapters/security/**` |
| 4 | PurpleBear | .7 | `packages/server/src/adapters/infra/**` |
| 5 | GoldHawk | .8 | `packages/server/src/adapters/chat/**` |
| 6 | SilverWolf | .9 → .10 → .11 → .12 | `packages/server/src/factories/**`, `packages/server/src/routes/**`, `packages/server/src/app.ts` |
| 7 | CoralReef | .13 → .14 | `packages/widget/**` |
| 8 | IronGate | .15 | `packages/server/tests/**` |

## Track Details

### Track 1: BlueLake — Foundation (serial, unblocks everything)
**File scope**: `packages/types/**`, `packages/server/src/interfaces/**`, root configs (`pnpm-workspace.yaml`, `tsconfig.base.json`, `package.json`)
**Beads**:
1. `agent-toolkit-2hv.1`: Monorepo scaffold — pnpm workspaces, tsconfig, all package.json files
2. `agent-toolkit-2hv.2`: Shared types — API DTOs, domain types, SSE event union types
3. `agent-toolkit-2hv.3`: All 8 interfaces — ChatProvider, SessionStore, UsageTracker, RateLimiter, TokenService, EncryptionService, DomainValidator, Logger

**This track MUST complete before any other track starts.**

### Track 2: GreenCastle — Data Layer
**File scope**: `packages/server/src/db/**`, `packages/server/src/adapters/storage/**`
**Beads**:
1. `agent-toolkit-2hv.4`: Drizzle schema — workspaces, sessions, usage tables + migrations
2. `agent-toolkit-2hv.6`: Storage adapters — PostgresSessionStore, PostgresUsageTracker

**Starts after**: Track 1 completes (.3 done)

### Track 3: RedStone — Security Adapters
**File scope**: `packages/server/src/adapters/security/**`
**Beads**:
1. `agent-toolkit-2hv.5`: AesEncryptionService, JwtTokenService, AllowlistDomainValidator

**Starts after**: Track 1 completes (.3 done)

### Track 4: PurpleBear — Infrastructure Adapters
**File scope**: `packages/server/src/adapters/infra/**`
**Beads**:
1. `agent-toolkit-2hv.7`: InMemoryRateLimiter, PinoLoggerAdapter

**Starts after**: Track 1 completes (.3 done)

### Track 5: GoldHawk — Chat Provider Adapter (HIGH RISK)
**File scope**: `packages/server/src/adapters/chat/**`
**Beads**:
1. `agent-toolkit-2hv.8`: RagflowAdapter — ChatProvider implementation with SSE streaming

**Starts after**: Track 1 completes (.3 done)
**Note**: HIGH risk item. SSE format from RAGFlow undocumented. Build with configurable parser. See `.spikes/` for spike notes.

### Track 6: SilverWolf — Server Assembly (critical path)
**File scope**: `packages/server/src/factories/**`, `packages/server/src/routes/**`, `packages/server/src/app.ts`, `packages/server/src/server.ts`
**Beads**:
1. `agent-toolkit-2hv.9`: All 5 factories — ChatProvider, Session, Token, Workspace, ErrorResponse
2. `agent-toolkit-2hv.10`: Fastify createApp() with @fastify/awilix DI wiring
3. `agent-toolkit-2hv.11`: Route: POST /widget/session — domain validation, JWT token
4. `agent-toolkit-2hv.12`: Route: POST /widget/chat — auth, rate limit, session map, SSE proxy

**Starts after**: Tracks 2, 3, 4, 5 ALL complete (needs all adapters)

### Track 7: CoralReef — Widget Package
**File scope**: `packages/widget/**`
**Beads**:
1. `agent-toolkit-2hv.13`: useRagflowChat hook — fetch+ReadableStream SSE parsing
2. `agent-toolkit-2hv.14`: RagflowChatWidget UI — bubble, messages, input, theming

**Starts after**: Track 6 completes (.12 done — widget needs API endpoints)

### Track 8: IronGate — Integration Tests
**File scope**: `packages/server/tests/**`
**Beads**:
1. `agent-toolkit-2hv.15`: Full flow integration test with mock RAGFlow server

**Starts after**: Track 6 (.12) AND Track 7 (.14) complete

## Cross-Track Dependencies

```
Track 1 (BlueLake)  ──────────────────────────────────┐
  .1 → .2 → .3                                        │
           │                                           │
           ├── Track 2 (GreenCastle): .4 → .6 ────┐   │
           ├── Track 3 (RedStone):    .5 ──────────┤   │
           ├── Track 4 (PurpleBear):  .7 ──────────┤   │
           └── Track 5 (GoldHawk):    .8 ──────────┤   │
                                                    │   │
                Track 6 (SilverWolf): .9→.10→.11→.12───┤
                                                    │   │
                Track 7 (CoralReef):  .13 → .14 ───────┤
                                                        │
                Track 8 (IronGate):   .15 ──────────────┘
```

**Parallelism windows:**
- Phase A (serial): Track 1 — .1, .2, .3
- Phase B (4 parallel): Tracks 2, 3, 4, 5 — .4/.6, .5, .7, .8
- Phase C (serial): Track 6 — .9, .10, .11, .12
- Phase D (serial): Track 7 — .13, .14
- Phase E (serial): Track 8 — .15

**Maximum parallelism: 4 agents** (during Phase B)

## Key Learnings (from Spikes)

- **EventSource cannot be used for POST requests** — widget hook must use `fetch()` + `ReadableStream` + manual SSE frame parsing (not `EventSource` API). This affects .13 design.
- **RAGFlow SSE format undocumented** — RagflowAdapter (.8) must have configurable SSE parser. Spike deferred until RAGFlow credentials available. See `.spikes/2026-04-22-2hv-ragflow-chat-widget/ragflow-sse-spike.md`.
- **DI approach**: @fastify/awilix with app-scope singletons + request-scope resolution. Routes access services via `request.diScope.cradle`.
