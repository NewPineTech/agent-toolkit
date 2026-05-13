import type {
  LangGraphDoneEvent,
  LangGraphErrorEvent,
  LangGraphMetadataEvent,
  ResponseReference,
  LangGraphRuntimeEvent,
} from "./events.js";
import { buildLangGraphWorkflow } from "./graph/build-graph.js";
import type {
  ExecutionPlan,
  LangGraphRuntimeInput,
  LangGraphWorkflowState,
  RouteDecision,
} from "./state.js";

export interface LangGraphModelClient {
  classifyRoute(input: RouteClassificationInput): Promise<RouteDecision>;
  createPlan?(input: RouteClassificationInput): Promise<ExecutionPlan>;
  streamText(input: TextGenerationInput): AsyncGenerator<string, void, unknown>;
}

export interface RouteClassificationInput {
  messages: LangGraphWorkflowState["messages"];
  userContext: LangGraphWorkflowState["userContext"];
  requestContext: LangGraphWorkflowState["requestContext"];
}

export interface TextGenerationInput {
  messages: LangGraphWorkflowState["messages"];
  contexts: LangGraphWorkflowState["retrievalContext"];
  toolResults?: LangGraphWorkflowState["stepResults"];
  plan?: LangGraphWorkflowState["executionPlan"];
  routeDecision: RouteDecision;
  systemPrompt?: string;
}

export interface Retriever {
  retrieve(query: string): Promise<LangGraphWorkflowState["retrievalContext"]>;
}

export interface ToolRegistry {
  execute(plan: ToolExecutionRequest): Promise<ToolExecutionResponse>;
}

export interface ToolExecutionRequest {
  capability: string;
  messages: LangGraphWorkflowState["messages"];
  userContext: LangGraphWorkflowState["userContext"];
  requestContext: LangGraphWorkflowState["requestContext"];
}

export interface ToolExecutionResponse {
  toolName: string;
  args: Record<string, unknown>;
  actionSummary: string;
  riskLevel: "low" | "medium" | "high";
  requiresConfirmation: boolean;
  result?: {
    status: "success" | "failed";
    data?: Record<string, unknown>;
    error?: string;
  };
}

export interface ExternalDependencyWarning {
  dependency: "retriever" | "toolRegistry" | "mcp";
  code: string;
  message: string;
  capability?: string;
}

export interface LangGraphRuntimeOptions {
  model: LangGraphModelClient;
  retriever?: Retriever;
  toolRegistry?: ToolRegistry;
  systemPrompt?: string;
  onExternalWarning?: (warning: ExternalDependencyWarning) => void;
}

export interface LangGraphRuntime {
  stream(
    input: LangGraphRuntimeInput,
  ): AsyncGenerator<LangGraphRuntimeEvent, void, unknown>;
}

export class LangGraphWorkflowError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly recoverable = false,
  ) {
    super(message);
    this.name = "LangGraphWorkflowError";
  }
}

export function createLangGraphRuntime(
  options: LangGraphRuntimeOptions,
): LangGraphRuntime {
  const workflow = buildLangGraphWorkflow(options);

  return {
    async *stream(input) {
      try {
        const state = await workflow.invoke(input);
        yield createMetadataEvent(state);

        if (state.confirmation.status === "pending" && state.toolPlan) {
          yield {
            type: "confirmation_required",
            capability: state.toolPlan.capability,
            action: state.toolPlan.toolName,
            summary: state.toolPlan.actionSummary,
            riskLevel: state.toolPlan.riskLevel,
          };
          yield createDoneEvent(input);
          return;
        }

        if (state.finalAnswer) {
          yield { type: "token", content: state.finalAnswer };
        } else if (state.routeDecision) {
          for await (const token of options.model.streamText({
            messages: state.messages,
            contexts: state.retrievalContext,
            toolResults: state.stepResults,
            plan: state.executionPlan,
            routeDecision: state.routeDecision,
            systemPrompt: options.systemPrompt,
          })) {
            yield { type: "token", content: token };
          }
        }

        yield createDoneEvent(input);
      } catch (error) {
        yield createErrorEvent(error);
      }
    },
  };
}

export function notifyExternalWarning(
  options: LangGraphRuntimeOptions,
  warning: ExternalDependencyWarning,
): void {
  try {
    options.onExternalWarning?.(warning);
  } catch {
    // Warning hooks must never break the chat flow.
  }
}

function createMetadataEvent(
  state: LangGraphWorkflowState,
): LangGraphMetadataEvent {
  return {
    type: "metadata",
    data: {
      route: state.routeDecision?.route ?? "unsupported",
      capability: state.routeDecision?.capability,
      retrieval: state.retrievalContext,
      plan: state.executionPlan,
      toolResults: state.stepResults,
      references: createReferences(state),
      artifacts: [],
    },
  };
}

function createReferences(state: LangGraphWorkflowState): ResponseReference[] {
  return state.retrievalContext.map((chunk, index) => ({
    id: `ref_${index + 1}`,
    ...(chunk.source ? { title: chunk.source, source: chunk.source } : {}),
    ...(chunk.score === undefined ? {} : { score: chunk.score }),
  }));
}

function createDoneEvent(input: LangGraphRuntimeInput): LangGraphDoneEvent {
  return {
    type: "done",
    sessionId: input.sessionId,
    providerSessionId: input.sessionId,
  };
}

function createErrorEvent(error: unknown): LangGraphErrorEvent {
  if (error instanceof LangGraphWorkflowError) {
    return {
      type: "error",
      code: error.code,
      message: error.message,
      recoverable: error.recoverable,
    };
  }

  return {
    type: "error",
    code: "LANGGRAPH_WORKFLOW_ERROR",
    message: "LangGraph workflow failed",
    recoverable: false,
  };
}
