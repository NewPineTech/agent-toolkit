import { Annotation } from "@langchain/langgraph";
import { z } from "zod";
import type { AgenticIntent } from "./constants.js";

export type AgenticMessageRole = "user" | "assistant" | "system" | "tool";

export interface AgenticMessage {
  role: AgenticMessageRole;
  content: string;
}

export interface AgenticWorkflowResult {
  intent: AgenticIntent;
  answer: string;
  warnings: string[];
}

export interface AgenticState {
  message: string;
  messages: AgenticMessage[];
  memorySummary: string | undefined;
  standaloneQuery: string | undefined;
  selectedIntents: AgenticIntent[];
  workflowResults: AgenticWorkflowResult[];
  finalAnswer: string | undefined;
  warnings: string[];
}

export const AgenticStudioDefaultInput =
  "Xin chao, cho em hoi ve chinh sach nghi phep cua cong ty";

export const AgenticInputSchema = z.object({
  message: z.string().default(AgenticStudioDefaultInput),
});

function overwriteWithDefault<T>(defaultValue: () => T) {
  return {
    reducer: (_left: T, right: T): T => right,
    default: defaultValue,
  };
}

export const AgenticStateAnnotation = Annotation.Root({
  message: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  messages: Annotation<AgenticMessage[]>(
    overwriteWithDefault<AgenticMessage[]>(() => []),
  ),
  memorySummary: Annotation<string | undefined>(
    overwriteWithDefault<string | undefined>(() => undefined),
  ),
  standaloneQuery: Annotation<string | undefined>(
    overwriteWithDefault<string | undefined>(() => undefined),
  ),
  selectedIntents: Annotation<AgenticIntent[]>(
    overwriteWithDefault<AgenticIntent[]>(() => []),
  ),
  workflowResults: Annotation<AgenticWorkflowResult[]>(
    overwriteWithDefault<AgenticWorkflowResult[]>(() => []),
  ),
  finalAnswer: Annotation<string | undefined>(
    overwriteWithDefault<string | undefined>(() => undefined),
  ),
  warnings: Annotation<string[]>(overwriteWithDefault<string[]>(() => [])),
});

export function createInitialAgenticState(message: string): AgenticState {
  return {
    message,
    messages: [],
    memorySummary: undefined,
    standaloneQuery: undefined,
    selectedIntents: [],
    workflowResults: [],
    finalAnswer: undefined,
    warnings: [],
  };
}
