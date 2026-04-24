# Approach: Typewriter Streaming UX

## Gap Analysis

| Component | Have | Need | Gap |
|-----------|------|------|-----|
| Typewriter hook | `useTypingEffect` — 2 chars/18ms | 1 char/20-30ms per spec | Timing adjustment only |
| Input blocking | `isBusy = isStreaming \|\| isTyping` | Same | None |
| Widget integration | `MessageContent` → `useTypingEffect` → `onAnimatingChange` | Same | None |
| Always-on behavior | Yes — every assistant message animated | Same | None |
| Abort/cleanup | `setInterval` cleanup in effect return | Same | None |
| Widget tests | None (Vitest configured, 0 test files) | Tests for typewriter + hook | New tests needed |
| Configurability | Hardcoded defaults in hook | Expose via widget props (optional) | Nice-to-have |

## Recommended Approach

**The feature already exists.** Scope reduces to:

1. **Tune timing** — Adjust `useTypingEffect` defaults from `charsPerTick=2, intervalMs=18` (9ms/char) to `charsPerTick=1, intervalMs=25` (25ms/char) to match the 20-30ms spec
2. **Add widget tests** — Unit tests for `useTypingEffect` hook and integration tests for the typewriter flow in `useRagflowChat` → `MessageContent` chain
3. **(Optional)** Expose timing config as widget props for consumer customization

### Alternative Approaches

1. **Move buffer into useRagflowChat hook** — Oracle suggested a ref-based buffer inside the chat hook itself, with `setTimeout` chain. More complex, duplicates what `useTypingEffect` already does at component level. Not recommended given existing architecture.
2. **Keep current timing** — 9ms/char is faster than spec but still looks good. Could skip the tuning entirely. Trade-off: doesn't match what was agreed in discussion.

## Risk Map

| Component | Risk | Reason | Verification |
|-----------|------|--------|--------------|
| Timing adjustment | LOW | Single constant change, no logic change | Manual test |
| useTypingEffect tests | LOW | Pure hook, deterministic timer logic | Unit test with fake timers |
| Widget integration tests | MEDIUM | React 19, no existing test patterns in widget pkg | Need to set up test infrastructure (jsdom/happy-dom) |

## Decision

No HIGH risk items. No spikes needed. Proceed directly to decomposition.
