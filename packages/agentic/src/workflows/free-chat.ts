import { AGENTIC_INTENTS } from "../constants.js";
import { loadPrompt } from "../prompt-loader.js";
import {
  AgenticStateAnnotation,
  createEmptyAgenticEvidence,
  type AgenticState,
} from "../state.js";
import { buildFreeChatContext } from "../tools/free-chat.js";
import { generateModelResponse } from "../model.js";
import { buildMemoryContext } from "../memory.js";
import { END, START, StateGraph } from "@langchain/langgraph";

async function freeChatNode(state: AgenticState) {
  const prompt = await loadPrompt("free-chat");
  const context = await buildFreeChatContext(
    state.standaloneQuery ?? state.message,
  );
  const userPrompt = [
    buildMemoryContext(state),
    context ? `Free chat context:\n${context}` : "",
    `Current message:\n${state.standaloneQuery ?? state.message}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const response = await generateModelResponse(
    {
      system: prompt,
      prompt: userPrompt,
    },
    {
      temperature: 0.4,
      topP: 0.9,
      presencePenalty: null,
      frequencyPenalty: null,
      maxTokens: 512,
    },
  );
  const warnings = uniqueWarnings([...state.warnings, ...response.warnings]);

  return {
    workflowResults: [
      {
        intent: AGENTIC_INTENTS.freeChat,
        answer: response.content,
        warnings,
        evidence: createEmptyAgenticEvidence(),
      },
    ],
    warnings,
  };
}

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings)];
}

export const freeChatGraph = new StateGraph(AgenticStateAnnotation)
  .addNode("free_chat_answer", freeChatNode)
  .addEdge(START, "free_chat_answer")
  .addEdge("free_chat_answer", END)
  .compile();
