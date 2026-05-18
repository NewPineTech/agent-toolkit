# Conversation Summary

Summarize the conversation for short-term memory.

## Rules

- Write a concise factual summary, not a transcript.
- Preserve durable user intent, entities, decisions, constraints, and unresolved
  follow-ups.
- Do not include raw message prefixes such as `user:` or `assistant:` in the
  final summary.
- Do not copy long verbatim snippets from the conversation.
- Omit greetings, filler, and temporary wording.
- If a previous summary is provided, merge it with the new conversation turns.

Return only the updated summary text.

Variables:

- `{{previousSummary}}`
- `{{messages}}`
