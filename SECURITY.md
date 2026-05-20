# Security Policy

Agent Toolkit protects provider credentials by keeping all RAGFlow, LangGraph,
model, and MCP secrets on the server side. Please report anything that weakens
that boundary privately.

## Supported Surface

Security reports are most useful when they affect:

- Widget session creation or token verification.
- Origin/domain allowlist enforcement.
- Authenticated workspace identity verification.
- Provider API key encryption, storage, or accidental exposure.
- Server-side proxying of RAGFlow, LangGraph, model, or MCP traffic.
- Rate limiting, message validation, or request isolation between workspaces.
- Docker, deployment, or environment handling that could expose secrets.

## Reporting a Vulnerability

Do not open a public GitHub issue for vulnerabilities.

If GitHub private vulnerability reporting is enabled for this repository, use
that channel. Otherwise, contact the repository owner directly with:

- A short description of the issue.
- Steps to reproduce or a minimal proof of concept.
- The affected package, route, command, or deployment path.
- Whether credentials, session tokens, workspace data, or provider traffic can
  be exposed or modified.

Avoid including real production secrets in the report. Use redacted values or a
local reproduction whenever possible.

## Security Principles

- Provider API keys must never be sent to the browser.
- `.env` files are local-only and must not be committed.
- `JWT_SECRET` should be at least 32 characters.
- `ENCRYPTION_KEY` should be a 64-character hex string.
- CORS, allowed-domain, iframe/embed, and session-token changes should be
  reviewed as security-sensitive.
