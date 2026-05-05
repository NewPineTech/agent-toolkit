# Discovery Report: Typewriter Streaming UX

## Architecture Snapshot

- Relevant packages: `packages/widget` (React hook + component), `packages/types` (SSE event types)
- Key modules:
  - `packages/widget/src/hooks/useRagflowChat.ts` — Main chat hook, manages SSE parsing and message state
  - `packages/widget/src/hooks/useTypingEffect.ts` — **Already exists** — character-by-character animation hook
  - `packages/widget/src/components/RagflowChatWidget.tsx` — Widget component, already wired to useTypingEffect
- Entry points: `useRagflowChat` hook → consumed by `RagflowChatWidget` → `MessageContent` → `useTypingEffect`
- Backend: No changes needed — `RagflowAdapter` already yields `ChatStreamEvent` tokens via AsyncGenerator

## Existing Patterns — CRITICAL FINDING

**The typewriter effect is already fully implemented.** The complete chain:

1. `useRagflowChat` appends token content to assistant message (line 181)
2. `MessageContent` passes `content` + `isStreaming` to `useTypingEffect` (line 478)
3. `useTypingEffect` animates char-by-char: `charsPerTick=2`, `intervalMs=18` (9ms/char effective)
4. `isAnimating` propagated back via `onAnimatingChange` → `setIsTyping` (lines 314, 484)
5. `isBusy = isStreaming || isTyping` blocks input (line 196, 339, 347)

### Current Parameters vs. Spec

| Parameter         | Current            | Spec (from discussion) | Gap                    |
| ----------------- | ------------------ | ---------------------- | ---------------------- |
| charsPerTick      | 2                  | 1                      | Adjust                 |
| intervalMs        | 18                 | 20-30                  | Adjust                 |
| Effective ms/char | 9                  | 20-30                  | ~2-3x faster than spec |
| Always-on         | Yes                | Yes                    | Match                  |
| Input blocking    | Yes (via isTyping) | Yes                    | Match                  |

## Technical Constraints

- React 19 (peer: ^18 || ^19)
- Build: tsup, ESM, target ES2022
- Test framework: Vitest 3.0.0 (configured but **zero widget tests exist**)
- No animation libraries — pure setInterval-based timing

## Remaining Gaps

1. **Timing mismatch**: Current animation is ~2-3x faster than the 20-30ms/char spec
2. **No tests**: Widget package has zero test files despite Vitest being configured
3. **No configurability**: `charsPerTick` and `intervalMs` are hardcoded defaults in useTypingEffect, not exposed as widget props
