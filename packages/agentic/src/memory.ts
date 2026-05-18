import { AGENTIC_DEFAULTS } from "./constants.js";
import {
  generateModelResponse,
  isAgenticModelConfigured,
  type AgenticModelResponseOptions,
} from "./model.js";
import { loadPrompt } from "./prompt-loader.js";
import type { AgenticMessage, AgenticState } from "./state.js";

export type ConversationSummaryOptions = AgenticModelResponseOptions & {
  previousSummary?: string;
};

export function validateInput(state: Pick<AgenticState, "message">): void {
  if (typeof state.message !== "string" || state.message.trim().length === 0) {
    throw new Error("Message is required");
  }
}

export function trimConversationMessages(
  messages: AgenticMessage[],
): AgenticMessage[] {
  return messages.slice(-AGENTIC_DEFAULTS.memory.messageWindowSize);
}

export async function summarizeConversation(
  messages: AgenticMessage[],
  options: ConversationSummaryOptions = {},
): Promise<string | undefined> {
  if (messages.length === 0) {
    return undefined;
  }

  if (!options.model && !isAgenticModelConfigured(options.env)) {
    return undefined;
  }

  const prompt = await loadPrompt("summarize-conversation");
  const transcript = messages.map(formatMemoryMessage).join("\n");
  const response = await generateModelResponse(
    {
      system: prompt,
      prompt: [
        options.previousSummary
          ? `Previous summary:\n${options.previousSummary}`
          : "",
        `Conversation turns:\n${transcript}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    {
      ...options,
      temperature: 0,
      topP: null,
      presencePenalty: null,
      frequencyPenalty: null,
      maxTokens: 384,
    },
  );

  if (
    response.warnings.some(
      (warning) =>
        warning === "MODEL_NOT_CONFIGURED" ||
        warning.startsWith("MODEL_INVOKE_FAILED:"),
    )
  ) {
    return undefined;
  }

  return response.content.trim() || undefined;
}

export function buildMemoryContext(
  state: Pick<AgenticState, "memorySummary" | "messages">,
): string {
  const recentConversation = state.messages
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");

  return [
    state.memorySummary ? `Memory summary:\n${state.memorySummary}` : "",
    recentConversation ? `Recent conversation:\n${recentConversation}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildCurrentExchangeMessages(state: AgenticState): AgenticMessage[] {
  const currentExchange = [
    { role: "user" as const, content: state.message.trim() },
  ];

  if (state.finalAnswer?.trim()) {
    currentExchange.push({
      role: "assistant",
      content: state.finalAnswer.trim(),
    });
  }

  return currentExchange;
}

export function buildFinalExchangeMessages(state: AgenticState): AgenticMessage[] {
  return [
    ...trimConversationMessages(state.messages),
    ...buildCurrentExchangeMessages(state),
  ];
}

export function buildSummaryBufferMessages(state: AgenticState): AgenticMessage[] {
  return [...state.summaryBufferMessages, ...buildCurrentExchangeMessages(state)];
}

export function appendFinalExchange(state: AgenticState): AgenticMessage[] {
  return trimConversationMessages(buildFinalExchangeMessages(state));
}

export function shouldSummarizeMemory(turnsSinceSummary: number): boolean {
  return turnsSinceSummary >= AGENTIC_DEFAULTS.memory.summaryTriggerTurns;
}

export async function buildSavedMemoryState(
  state: AgenticState,
  options: ConversationSummaryOptions = {},
): Promise<
  Pick<
    AgenticState,
    "messages" | "memorySummary" | "turnsSinceSummary" | "summaryBufferMessages"
  >
> {
  const messages = appendFinalExchange(state);
  const summaryBufferMessages = buildSummaryBufferMessages(state);
  const turnsSinceSummary = state.turnsSinceSummary + 1;

  if (!shouldSummarizeMemory(turnsSinceSummary)) {
    return {
      messages,
      memorySummary: state.memorySummary,
      turnsSinceSummary,
      summaryBufferMessages,
    };
  }

  const memorySummary = await summarizeConversation(summaryBufferMessages, {
    ...options,
    previousSummary: state.memorySummary,
  });

  if (!memorySummary) {
    return {
      messages,
      memorySummary: state.memorySummary,
      turnsSinceSummary,
      summaryBufferMessages,
    };
  }

  return {
    messages,
    memorySummary,
    turnsSinceSummary: 0,
    summaryBufferMessages: [],
  };
}

function formatMemoryMessage(message: AgenticMessage): string {
  return `${message.role}: ${message.content}`;
}
