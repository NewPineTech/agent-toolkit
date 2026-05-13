import type { RouteClassificationInput } from "../runtime.js";

export interface ToolDescriptor {
  capability: string;
  name: string;
  description?: string;
  readOnly: boolean;
}

export function buildToolSelectionPrompt(
  input: RouteClassificationInput,
  tools: ToolDescriptor[],
): string {
  return [
    "Select the safest tool capability for the user request.",
    "Return only JSON with: capability, confidence, reason.",
    "Prefer read-only tools. If no tool fits, return capability null.",
    `Tools:\n${tools
      .map(
        (tool) =>
          `- ${tool.capability}: ${tool.name}; readOnly=${tool.readOnly}; ${tool.description ?? ""}`,
      )
      .join("\n")}`,
    `Conversation:\n${input.messages
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n")}`,
  ].join("\n\n");
}
