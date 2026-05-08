# CLI Shared Logic Refactor Execution Plan

Date: 2026-05-07

## Objective

Remove duplicated production logic from CLI command implementations while preserving the current user-facing CLI surface.

## Execution Tracks

### Track 1: Shared Core Foundation

Create `packages/core` as `@agent-toolkit/core`, add it to workspace builds, and move pure shared behavior into it.

Scope:

- Package scaffold and TypeScript config.
- Public exports.
- Domain validator.
- Encryption service.
- Shared parse/default helpers where appropriate.

This track is the critical path for the rest of the refactor.

### Track 2: Server Uses Core

Replace server-local validator/encryption implementations with imports from core.

Scope:

- Update DI wiring/imports.
- Preserve public interfaces where server expects `DomainValidator` and `EncryptionService`.
- Move or update tests so behavior remains covered.

Depends on Track 1.

### Track 3: CLI Uses Core and Thin Command Boundaries

Refactor CLI command implementations away from duplicate business rules.

Scope:

- `domain test`: use shared validator.
- `workspace`: use shared normalization/encryption/redaction helpers and isolate DB access.
- `provider test`: use shared provider smoke-test helper or rename lightweight probe explicitly.
- `widget`: use shared embed URL builder/field map.
- `usage` and `sessions`: isolate direct DB access and flag cache-sensitive mutation behavior.

Depends on Track 1. Some work can run in parallel with Track 2 once core exports are stable.

### Track 4: Test and Verification

Add regression coverage that proves CLI and server share behavior.

Scope:

- Core unit tests for domain validation and encryption compatibility.
- CLI tests for domain edge cases, widget URL output, and workspace option normalization.
- Server tests updated to import core behavior.
- Full typecheck and test run.

Depends on Tracks 1-3.

## Suggested Order

1. Scaffold `@agent-toolkit/core`.
2. Move domain validator and encryption into core with tests.
3. Switch server imports to core.
4. Switch CLI `domain test` and `config validate` to core helpers.
5. Extract CLI workspace repository/use-case helpers.
6. Normalize provider test semantics.
7. Share widget embed URL builder.
8. Run full verification.

## Non-Goals

- Do not change CLI command names or user-facing flags.
- Do not introduce new provider support.
- Do not redesign server routes.
- Do not add branch/commit/PR automation.

## Verification Commands

```bash
pnpm --filter @agent-toolkit/core run typecheck
pnpm --filter @agent-toolkit/core run test
pnpm --filter @agent-toolkit/server run test
pnpm --filter @agent-toolkit/cli run test
pnpm -r run typecheck
pnpm -r run test
```

If full repo tests are slow, run focused package tests first and finish with the recursive commands before marking the refactor complete.

## Rollout Notes

- Treat `domain test` as the first regression to fix because it currently gives incorrect guidance.
- Keep direct DB access behind CLI repository helpers until admin HTTP endpoints exist.
- Consider a later follow-up for admin APIs that let CLI mutate workspace/session state through the server, including cache invalidation and audit hooks.
