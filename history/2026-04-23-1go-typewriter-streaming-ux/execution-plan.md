# Execution Plan: Typewriter Streaming UX

Epic: agent-toolkit-1go
Generated: 2026-04-23

## Key Finding

The typewriter effect is **already implemented** in the codebase. This plan covers only timing adjustment and test coverage.

## Tracks

| Track | Agent | Beads (in order) | File Scope |
|-------|-------|-------------------|------------|
| 1 | AmberWidget | 1go.1 → 1go.2 → 1go.3 | `packages/widget/**` |

## Track Details

### Track 1: AmberWidget — Widget timing tune + tests

**File scope**: `packages/widget/**`
**Beads**:

1. `1go.1`: Tune useTypingEffect defaults to 1 char/25ms — Change line 18 of `useTypingEffect.ts`: `charsPerTick=2, intervalMs=18` → `charsPerTick=1, intervalMs=25`
2. `1go.2`: Unit tests for useTypingEffect hook — New file `useTypingEffect.test.ts`. Vitest fake timers, test char-by-char reveal, mid-animation content append, cleanup.
3. `1go.3`: Integration tests for RagflowChatWidget — New file `RagflowChatWidget.test.tsx`. May need `@testing-library/react` + `happy-dom`. Test message rendering through typewriter, input blocking during animation.

## Cross-Track Dependencies

None — single track.

## Key Learnings

- `useTypingEffect` hook already exists at `packages/widget/src/hooks/useTypingEffect.ts`
- Full integration chain already wired: `useRagflowChat` → `MessageContent` → `useTypingEffect` → `onAnimatingChange` → `isTyping` → `isBusy`
- Input blocking already works via `isBusy = isStreaming || isTyping` in `ChatPanel` (line 196)
- Widget package has Vitest configured but zero test files — test infrastructure needs bootstrapping
- Oracle recommended `setTimeout` chain over `setInterval` — current impl uses `setInterval` which works fine for this simple case, no change needed

## Estimated Effort

- 1go.1: ~5 minutes (single constant change)
- 1go.2: ~30 minutes (new test file, fake timer setup)
- 1go.3: ~45 minutes (React test infra setup, component test)
- **Total: ~1.5 hours**
