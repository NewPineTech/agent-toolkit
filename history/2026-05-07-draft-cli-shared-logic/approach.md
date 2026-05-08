# CLI Shared Logic Refactor Approach

Date: 2026-05-07

## Decision

Use a thin-command architecture:

1. CLI command files parse Commander options and format stdout/stderr only.
2. Runtime-independent behavior moves to a new shared package: `@agent-toolkit/core`.
3. Server and CLI both import the same core modules for validation, normalization, encryption, provider smoke-test contracts, and widget URL construction.
4. Commands that mutate production runtime state should prefer server/admin HTTP APIs. Direct DB access should remain only where there is no API yet, and should be isolated behind repository classes rather than embedded in command files.

## Why This Approach

Duplicating production logic in CLI commands makes diagnostics unreliable. The current `domain test` command already disagrees with server behavior. A shared core package fixes this without making CLI depend on the full server app.

Rejected alternatives:

- Import server adapters directly from CLI: too much dependency coupling and likely startup/runtime side effects.
- Keep duplicate logic plus more tests: tests can detect drift only after it happens; they do not remove the structural problem.
- Move everything into `@agent-toolkit/types`: executable runtime behavior would blur the role of the type package.

## Target Dependency Graph

```text
@agent-toolkit/types
        ^
        |
@agent-toolkit/core
   ^          ^
   |          |
@agent-toolkit/server
@agent-toolkit/cli
```

No dependency from `core` to `server` or `cli`.

## Refactor Boundaries

### Shared Core

Move or create:

- Domain allowlist validator.
- AES-GCM encryption service and key validation.
- Workspace option normalization/defaults/redaction helpers.
- Widget embed URL builder and supported option map.
- Provider health check interface and RAGFlow smoke-test helper that exercises real authenticated session creation behavior or a clearly named lightweight connectivity probe.

### Server

Replace local copies with imports from `@agent-toolkit/core`:

- `AllowlistDomainValidator`
- `AesEncryptionService`
- Any widget option field constants if introduced.

Server remains owner of:

- Fastify routes.
- DI container wiring.
- Drizzle schema and migrations.
- Request auth, rate limiting, cache, and route error handling.

### CLI

Refactor command files so they call use-case functions:

- `domain test` uses the shared domain validator exactly.
- `workspace create/update` uses shared normalization and encryption. DB SQL moves into a repository/helper module, not inline command logic.
- `provider test` uses the same provider smoke-test semantics as production.
- `widget` uses shared embed URL builder/option mapping.
- `sessions expire` either calls an API that clears cache or documents that it is DB-only until an admin API exists.

## Risk Map

- LOW: moving domain validator and encryption into `core`; behavior exists and tests can be copied.
- LOW: sharing widget URL field constants; mostly pure functions.
- MEDIUM: workspace command refactor because it touches DB writes and option normalization.
- MEDIUM: provider test refactor because a real provider smoke test needs encrypted API key decrypt and network behavior.
- MEDIUM: session expiry semantics because server cache invalidation may require a new endpoint or explicit cache delete path.

No spike is required before implementation. The patterns are local and bounded.

## Implementation Principles

- One source of truth per business rule.
- CLI commands never contain SQL strings plus domain/business decisions in the same function.
- CLI presentation logic stays in CLI.
- Shared modules must be pure or side-effect-light.
- Use types from `@agent-toolkit/types`; do not duplicate domain interfaces.
- Every changed behavior gets tests at the shared module level and at least one CLI-level regression test.

## Acceptance Criteria

- `domain test` reports the same result as the server domain validator for exact, wildcard, empty, invalid, and case-normalized origins.
- Encryption output remains decryptable by server after moving to shared core.
- Workspace create/update behavior is covered by tests for defaults, positive integer parsing, domain parsing, secret encryption, redaction, and partial rate-limit update.
- Provider test semantics are explicit and match production provider behavior or are clearly named as a lightweight connectivity probe.
- Widget embed URL generation has one shared option map.
- `pnpm -r run typecheck` and `pnpm -r run test` pass.
