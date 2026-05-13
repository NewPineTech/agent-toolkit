import type { RetrievalChunk, RiskLevel } from "./events.js";

export type RuntimeRoute =
  | "free_chat"
  | "knowledge_qa"
  | "complex_analysis"
  | "tool_task"
  | "tool_action"
  | "ticket_creation"
  | "report_generation"
  | "admin_action"
  | "clarification"
  | "unsupported";

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface RuntimeMessage {
  role: MessageRole;
  content: string;
}

export interface RuntimeUserContext {
  userId: string;
  role: string;
  permissions: string[];
}

export interface RuntimeRequestContext {
  sessionId: string;
  requestId: string;
}

export interface RouteDecision {
  route: RuntimeRoute | string;
  capability?: string;
  confidence: number;
  reason: string;
}

export interface ToolPlan {
  capability: string;
  toolName: string;
  args: Record<string, unknown>;
  actionSummary: string;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
}

export interface ToolExecutionResult {
  status: "success" | "failed";
  data?: Record<string, unknown>;
  error?: string;
}

export interface ExecutionStep {
  id: string;
  type: "memory" | "retrieval" | "mcp_tool" | "analysis";
  instruction: string;
  capability?: string;
}

export interface ExecutionPlan {
  goal: string;
  steps: ExecutionStep[];
  responseFormat: Array<
    "markdown" | "references" | "table" | "chart" | "image"
  >;
}

export interface StepExecutionResult {
  stepId: string;
  type: ExecutionStep["type"];
  capability?: string;
  status: "success" | "failed";
  data?: Record<string, unknown>;
  error?: string;
}

export interface VerificationResult {
  status: "passed" | "failed" | "needs_retry";
  reason?: string;
}

export interface ConfirmationState {
  status: "not_required" | "pending" | "approved" | "rejected";
  summary?: string;
}

export interface LangGraphWorkflowState {
  messages: RuntimeMessage[];
  userContext: RuntimeUserContext;
  requestContext: RuntimeRequestContext;
  routeDecision?: RouteDecision;
  retrievalContext: RetrievalChunk[];
  toolPlan?: ToolPlan;
  toolResult?: ToolExecutionResult;
  executionPlan?: ExecutionPlan;
  stepResults: StepExecutionResult[];
  toolError?: string;
  verification?: VerificationResult;
  confirmation: ConfirmationState;
  finalAnswer?: string;
}

export interface LangGraphRuntimeInput {
  sessionId: string;
  requestId: string;
  userContext: RuntimeUserContext;
  messages: RuntimeMessage[];
  memorySummary?: string;
}

export function getLastUserMessage(messages: RuntimeMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      return message.content;
    }
  }
  return "";
}

export function createInitialState(
  input: LangGraphRuntimeInput,
): LangGraphWorkflowState {
  return {
    messages: input.messages,
    userContext: input.userContext,
    requestContext: {
      sessionId: input.sessionId,
      requestId: input.requestId,
    },
    ...(input.memorySummary
      ? {
          messages: [
            {
              role: "system",
              content: `Conversation summary: ${input.memorySummary}`,
            },
            ...input.messages,
          ],
        }
      : {}),
    retrievalContext: [],
    stepResults: [],
    confirmation: {
      status: "not_required",
    },
  };
}
