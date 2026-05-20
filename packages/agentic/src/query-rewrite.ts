import { loadPrompt } from "./prompt-loader.js";
import {
  generateModelResponse,
  isAgenticModelConfigured,
  type AgenticChatModel,
  type AgenticModelSettings,
} from "./model.js";
import type { AgenticState } from "./state.js";

export async function rewriteQueryFromMemory(
  state: Pick<AgenticState, "message" | "messages" | "memorySummary">,
  options: AgenticModelSettings & { model?: AgenticChatModel } = {},
): Promise<string> {
  const prompt = await loadPrompt("rewrite-query");

  const message = state.message.trim();
  const recentContext = state.messages
    .slice(-3)
    .map((item) => `${item.role}: ${item.content}`)
    .join("\n");

  if (!recentContext && !state.memorySummary) return message;

  const contextualPrompt = [
    state.memorySummary ? `Conversation summary:\n${state.memorySummary}` : "",
    recentContext ? `Recent conversation:\n${recentContext}` : "",
    `Current user question:\n${message}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (options.model || isAgenticModelConfigured()) {
    const response = await generateModelResponse(
      {
        system: prompt,
        prompt: contextualPrompt,
      },
      {
        ...options,
        temperature: 0,
        topP: null,
        presencePenalty: null,
        frequencyPenalty: null,
        maxTokens: 256,
      },
    );
    const rewritten = response.content.trim();
    if (rewritten) return rewritten;
  }

  return contextualPrompt;
}
