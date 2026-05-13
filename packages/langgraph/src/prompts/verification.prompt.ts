export function buildVerificationPrompt(): string {
  return [
    "Verify the draft answer against retrieved context and tool results.",
    "Return only JSON with: status, reason.",
    "Allowed status values: passed, failed, needs_retry.",
    "Fail if references are invented, if tool results are contradicted, or if the answer claims unavailable data.",
  ].join("\n");
}
