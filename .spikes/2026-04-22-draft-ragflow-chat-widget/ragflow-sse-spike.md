# Spike: RAGFlow SSE Stream Format

## Question to Answer

What is the exact SSE frame format returned by RAGFlow's agent completions API when `stream: true`?

## Why This Matters

The RagflowAdapter and the widget's stream parser both depend on knowing the exact format of SSE frames. Without this, we're guessing at parsing logic.

## What to Validate (when RAGFlow credentials are available)

1. Hit `POST /api/v1/agents/{agent_id}/completions` with `stream: true`
2. Capture raw response bytes — document exact SSE frame format:
   - Does it use `data:` prefix?
   - Does it send `event:` types?
   - What's the delimiter (double newline)?
   - What's the JSON structure inside `data:` lines?
   - How is stream termination signaled? (`data: [DONE]`? Empty data?)
3. Test error mid-stream — what happens if the agent fails partway?
4. Test session creation — does first call auto-create a session_id?
5. Measure typical latency: time-to-first-token, total stream duration

## Mitigation Until Spike Completes

- Build RagflowAdapter with a configurable SSE parser
- Default to standard SSE format (`data: {json}\n\n`)
- Make the parser an injectable dependency so it can be swapped if RAGFlow uses non-standard format
- First real integration test with RAGFlow credentials will validate/fix the parser

## Status

DEFERRED — requires RAGFlow server access and API credentials to execute
