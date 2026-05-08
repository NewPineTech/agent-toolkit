# CLI Shared Logic Refactor Discovery

Date: 2026-05-07

## Goal

Refactor CLI commands so they do not duplicate production business logic. Command files should parse arguments, call shared behavior, and format output. Validation, encryption, persistence rules, provider checks, and domain allowlist behavior should have one source of truth.

## Current Shape

- CLI entrypoint: `packages/cli/src/cli.ts`
- CLI command implementations: `packages/cli/src/commands/*.ts`
- CLI DB/helper layer: `packages/cli/src/db.ts`
- Server domain/runtime logic: `packages/server/src/**`
- Shared public types: `packages/types/src/**`

The current workspace has three packages:

- `@agent-toolkit/types`: domain and API types only, no runtime dependencies.
- `@agent-toolkit/server`: Fastify app, Drizzle schema, adapters, factories, validators.
- `@agent-toolkit/cli`: Commander CLI with direct `pg` access and some direct runtime logic.

## Duplication Found

### Domain Allowlist

CLI logic in `packages/cli/src/commands/domain.ts` treats empty `allowed_domains` as allowed and only supports exact string matches plus `*`.

Server logic in `packages/server/src/adapters/security/allowlist-domain.validator.ts` treats empty allowlists as blocked, normalizes origin/domain values, validates URL syntax, and supports wildcard subdomains such as `*.example.com`.

This is the clearest correctness bug: `atk domain test` can report `allowed` while production would block the same request.

### Encryption

CLI encryption in `packages/cli/src/db.ts` manually implements AES-256-GCM with `iv + tag + encrypted` base64 output.

Server encryption in `packages/server/src/adapters/security/aes-encryption.service.ts` implements the same format. It is compatible today, but future key handling, validation, or ciphertext versioning could drift.

### Workspace Persistence and Defaults

CLI workspace commands in `packages/cli/src/commands/workspace.ts` construct SQL, apply defaults, parse domains, encrypt secrets, and update JSON rate limit config directly.

Server schema/defaults live in `packages/server/src/db/schema.ts`, and server runtime maps rows through `WorkspaceFactory`.

Risk: adding validation, new provider types, workspace cache invalidation, audit behavior, or schema changes server-side will not automatically affect CLI writes.

### Provider Test

CLI provider test in `packages/cli/src/commands/provider.ts` sends `HEAD` to `provider_base_url`.

Real RAGFlow behavior in `packages/server/src/adapters/chat/ragflow.adapter.ts` calls `/api/v1/agents/:agentId/sessions` with bearer auth. A plain `HEAD` check can pass even when real provider sessions fail.

### Usage and Sessions

CLI usage/session commands query and mutate DB directly in `packages/cli/src/commands/usage.ts` and `packages/cli/src/commands/sessions.ts`.

These are mostly admin/read-model behavior today, but direct writes such as `sessions expire` bypass server cache concerns. If Redis session cache is active, DB-only expiry can leave stale cached state.

### Widget and Ingest

Widget commands generate snippets and preview URLs. This is CLI presentation behavior and is acceptable in CLI, but embed query field names should be shared or tested against server embed query behavior.

Ingest commands orchestrate Python scripts. This is also acceptable CLI orchestration.

## Import Graph Constraint

The CLI should not import `@agent-toolkit/server` wholesale because server carries Fastify, Awilix, Redis, and runtime app dependencies. That would make CLI startup heavier and can introduce side effects.

The clean direction is one of:

1. Add a new `@agent-toolkit/core` package for runtime-independent logic.
2. Expand `@agent-toolkit/types` into a shared package with runtime helpers.

Recommended: add `@agent-toolkit/core`. Keep `@agent-toolkit/types` as type/enums only, and put executable shared logic in `core`.

## Candidate Shared Modules

- `@agent-toolkit/core/security/encryption`: AES encryption service and key parsing.
- `@agent-toolkit/core/security/domain-validator`: allowlist validator.
- `@agent-toolkit/core/workspaces`: input validation, defaults, normalization, redaction.
- `@agent-toolkit/core/widget`: embed option constants and URL builder.
- `@agent-toolkit/core/provider`: provider health/smoke-test contract.

DB-specific repositories can either live in server and be exposed behind API endpoints, or live in a shared persistence package. For this repo, prefer server HTTP/admin endpoints for behavior that affects runtime state, and use direct DB only for read-only inspection commands until an API exists.

## Existing Test Coverage

CLI tests in `packages/cli/src/cli.test.ts` currently cover help output, widget snippet generation, ingest dry-run mapping, and features output.

Server tests already cover several adapters/factories. The refactor should add focused unit tests around shared core modules and CLI integration tests that assert CLI commands call the shared behavior rather than reimplementing it.
