import type { RouteClassificationInput } from "../runtime.js";

export function buildRouteClassificationPrompt(
  input: RouteClassificationInput,
): string {
  return [
    "Classify the next LangGraph runtime route for this chat request.",
    "Return only JSON with: route, capability, confidence, reason.",
    "Allowed route values: free_chat, knowledge_qa, complex_analysis, tool_task, tool_action, ticket_creation, report_generation, admin_action, clarification, unsupported.",
    "Use free_chat for natural conversation that does not require private knowledge or tools.",
    "Use knowledge_qa for retrieval-backed questions.",
    "Use complex_analysis when the request needs multiple reasoning or retrieval/tool steps.",
    "Use tool_task or tool_action only when the request maps to an explicit user capability.",
    "Use clarification when required information is missing.",
    `User role: ${input.userContext.role}`,
    `User permissions: ${input.userContext.permissions.join(", ") || "none"}`,
    `Request id: ${input.requestContext.requestId}`,
    `Conversation:\n${input.messages
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n")}`,
  ].join("\n\n");
}
