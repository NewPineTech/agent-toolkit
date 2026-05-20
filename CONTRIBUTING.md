# Contributing to Agent Toolkit

Thanks for helping improve Agent Toolkit. This repository is treated as a
production-ready product, so contributions should keep security, tests, and
operational behavior in scope.

## Good First Contribution Areas

- Documentation that helps a new team run, embed, or deploy the toolkit.
- Widget examples for React, iframe, script-tag, or headless integrations.
- Provider adapter improvements that preserve the existing server-side key
  boundary.
- CLI usability improvements for workspace setup, smoke tests, usage, sessions,
  and ingest flows.
- Focused tests around auth, origin checks, rate limits, streaming, prompt
  loading, or LangGraph workflow routing.

## Development Setup

Use Node.js `>=22` and pnpm `>=9`.

```bash
pnpm install
cp .env.example .env
cp .env.prod.example .env.prod
docker compose up -d postgres redis
pnpm dev
```

For a full local stack, `pnpm dev` starts the Fastify server, Agentic `/chat`
runtime, and LangGraph Studio dev API. Use the package-specific commands in
`README.md` when working on a narrower area.

## Pull Request Expectations

- Keep PRs scoped to one logical change.
- Explain the problem, implementation, validation commands, and any config or
  deployment impact.
- Add or update tests for behavior changes.
- Do not commit secrets, local `.env` files, generated `dist/`, coverage output,
  or Storybook build output.
- Keep provider API keys server-side. Browser-facing widget changes must not
  introduce direct RAGFlow, model, or MCP secret access.

## Validation

Run the most relevant package checks first:

```bash
pnpm --filter @agent-toolkit/server run test
pnpm --filter @agent-toolkit/agentic run test
pnpm --filter @agent-toolkit/widget run test
pnpm typecheck
pnpm build
```

For security-sensitive server changes, include focused route/adapter tests and
verify `NODE_ENV=test` behavior. For prompt, router, retriever, or workflow
changes in `packages/agentic`, include `pnpm --filter @agent-toolkit/agentic run
test`.

## Style

- Write TypeScript as ESM.
- Put shared behavior in `@agent-toolkit/core` or `@agent-toolkit/types` instead
  of duplicating it across packages.
- Keep Agentic prompts as Markdown assets under `packages/agentic/src/prompts/`.
- Follow the existing kebab/dot filename style, such as
  `allowlist-domain.validator.ts` and `embed.route.test.ts`.
- Run `pnpm format:check` before opening larger PRs.
