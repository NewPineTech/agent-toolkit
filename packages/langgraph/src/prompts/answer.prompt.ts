import type { TextGenerationInput } from "../runtime.js";

export const DEFAULT_ANSWER_SYSTEM_PROMPT =
  "Answer naturally and accurately. Use retrieved context and tool results when provided. If sources are provided, cite them by source id and do not invent references.";

export function buildAnswerPrompt(request: TextGenerationInput): string {
  const context = request.contexts
    .map((item, index) => {
      const source = item.source ? ` source=${item.source}` : "";
      return `[${index + 1}${source}]\n${item.content}`;
    })
    .join("\n\n");

  const toolResults = (request.toolResults ?? [])
    .map((result, index) => {
      return `[tool-${index + 1}] ${result.capability} (${result.status})\n${JSON.stringify(
        result.data ?? { error: result.error },
      )}`;
    })
    .join("\n\n");

  return [
    request.systemPrompt ?? DEFAULT_ANSWER_SYSTEM_PROMPT,
    "Response rules:",
    "- Use Markdown when it improves readability.",
    "- Do not render raw HTML.",
    "- If a chart/image/table/reference artifact is useful, describe it in the response plan metadata; keep the streamed answer readable as Markdown text.",
    "- Separate observed data from inference.",
    `Route: ${request.routeDecision.route}`,
    context ? `Context:\n${context}` : "Context: none",
    toolResults ? `Tool results:\n${toolResults}` : "Tool results: none",
    request.plan
      ? `Plan:\n${JSON.stringify(request.plan, null, 2)}`
      : "Plan: none",
    `Conversation:\n${request.messages
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n")}`,
  ].join("\n\n");
}
