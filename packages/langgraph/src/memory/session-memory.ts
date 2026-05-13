import type { RuntimeMessage } from "../state.js";

export interface SessionMemoryOptions {
  maxMessages: number;
}

export function normalizeSessionMessages(input: unknown): RuntimeMessage[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const role = entry["role"];
    const content = entry["content"];
    if (
      (role === "system" ||
        role === "user" ||
        role === "assistant" ||
        role === "tool") &&
      typeof content === "string" &&
      content.trim().length > 0
    ) {
      return [{ role, content }];
    }
    return [];
  });
}

export function windowSessionMessages(
  messages: RuntimeMessage[],
  options: SessionMemoryOptions,
): RuntimeMessage[] {
  if (options.maxMessages <= 0) return [];
  return messages.slice(-options.maxMessages);
}

export function appendSessionTurn(
  messages: RuntimeMessage[],
  userContent: string,
  assistantContent: string,
  options: SessionMemoryOptions,
): RuntimeMessage[] {
  return windowSessionMessages(
    [
      ...messages,
      { role: "user", content: userContent },
      { role: "assistant", content: assistantContent },
    ],
    options,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
