# Repository Guidelines

## Project Structure & Module Organization

This is a pnpm monorepo for a RAGFlow-backed embeddable chat toolkit. Source lives under `packages/*/src`; generated output in `dist/`, `coverage/`, and `storybook-static/` is not hand-edited.

- `packages/server`: Fastify backend, session/auth routes, Drizzle DB code, Redis/Postgres adapters.
- `packages/agentic`: LangGraph HR assistant runtime, intent graphs, prompt assets, retrievers, and provider `/chat` API.
- `packages/widget`: React widget, hook, embed loader, Storybook stories, and UI tests.
- `packages/core`: shared validation, provider, security, workspace, and widget helpers.
- `packages/types`: shared DTOs and TypeScript types.
- `packages/cli`: end-user CLI exposed as `agent-toolkit` and `atk`.
- `tools/ragflow_kb_generater`: Python document ingestion pipeline.

## Production-Ready Engineering Bar

Treat this repository as a production-ready product, not an MVP or prototype. When making technical decisions, choose the durable, best-practice solution that fits the existing architecture instead of staging shortcuts such as "do this first, clean it up later." Prefer complete, maintainable changes with clear boundaries, tests, operational safety, and security implications handled in the same pass.

## Build, Test, and Development Commands

Use Node.js `>=22` and pnpm `>=9`.

- `pnpm dev`: run the server, Agentic runtime, and LangGraph Studio dev API together.
- `pnpm dev:server`: run only the Fastify server in watch mode.
- `pnpm dev:langgraph`: run the Agentic `/chat` runtime on port `2024`.
- `pnpm dev:langstudio`: run LangGraph Studio dev API on port `2025`.
- `pnpm dev:widget`: watch-build the widget package.
- `pnpm storybook`: start widget Storybook on port `6006`.
- `pnpm build`: build every package.
- `pnpm typecheck`: run TypeScript checks across packages.
- `pnpm test`: run all package Vitest suites.
- `pnpm format:check` / `pnpm format`: check or apply Prettier formatting.
- `pnpm db:*`: run Drizzle tasks (`generate`, `migrate`, `push`, `studio`) for the server package.

Prefer focused commands while iterating, such as `pnpm --filter @agent-toolkit/widget run test`.

## Coding Style & Naming Conventions

Write TypeScript as ESM. Keep shared behavior in `@agent-toolkit/core` and `@agent-toolkit/types` instead of duplicating logic. Agentic prompts are Markdown assets under `packages/agentic/src/prompts/`; keep prompt behavior covered by prompt-loader or workflow tests so build-time prompt copying stays reliable. Follow Prettier defaults. File names use descriptive kebab/dot patterns such as `allowlist-domain.validator.ts`, `jwt-token.service.ts`, and `embed.route.test.ts`.

For `packages/agentic`, keep non-secret MCP/runtime defaults in source constants, especially `AGENTIC_MCP_REGISTRY` in `packages/agentic/src/constants.ts`. Environment files should contain only secrets such as MCP bearer tokens and provider API keys.

## Testing Guidelines

Vitest is the primary test runner. Place tests beside source files as `*.test.ts` or `*.test.tsx`. For `packages/agentic`, keep tests in the nearest local `__test__/` folder for the source directory being tested, such as `src/http/__test__/chat.test.ts`. Widget component tests use React Testing Library and happy-dom; Storybook stories live as `*.stories.tsx`. Run Storybook tests with `pnpm --filter @agent-toolkit/widget run test:storybook`.

Run relevant package tests before broader workspace validation. For Agentic prompt, routing, or retriever changes, include `pnpm --filter @agent-toolkit/agentic run test`. For server changes touching env, auth, storage, or origin checks, include focused route/adapter tests and verify `NODE_ENV=test` behavior.

## Commit & Pull Request Guidelines

Recent history uses conventional-style subjects: `feat: ...`, `fix(scope): ...`, `docs: ...`, and `chore: ...`. Keep commits scoped to one logical change and use imperative, specific summaries.

Pull requests should include the problem, implementation summary, validation commands, and screenshots or Storybook notes for widget UI changes. Link related issues and call out config, migration, or deployment impacts.

## Security & Configuration Tips

Never expose provider API keys in the widget; all RAGFlow traffic must stay proxied through the server. Keep `.env` local, set `JWT_SECRET` to at least 32 characters, and use a 64-character hex `ENCRYPTION_KEY`. Treat CORS, allowed-domain, iframe/embed, and session-token changes as security-sensitive.
