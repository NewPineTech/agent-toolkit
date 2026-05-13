import type { RouteClassificationInput } from "../runtime.js";

export function buildPlannerPrompt(input: RouteClassificationInput): string {
  return [
    "Create a safe execution plan for this LangGraph request.",
    "Return only JSON with: goal, steps, responseFormat.",
    "Each step must include id, type, instruction, and optional capability.",
    "Allowed step types: memory, retrieval, mcp_tool, analysis.",
    "Use read-only tool steps when possible. Do not plan mutating actions without explicit confirmation.",
    "Response format may include markdown, references, table, chart, image.",
    `User permissions: ${input.userContext.permissions.join(", ") || "none"}`,
    `Conversation:\n${input.messages
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n")}`,
  ].join("\n\n");
}
