import type { LangGraphRuntimeOptions } from "../runtime.js";
import { notifyExternalWarning } from "../runtime.js";
import {
  getLastUserMessage,
  type ExecutionPlan,
  type LangGraphWorkflowState,
  type StepExecutionResult,
} from "../state.js";

export async function executePlan(
  state: LangGraphWorkflowState,
  options: LangGraphRuntimeOptions,
): Promise<Partial<LangGraphWorkflowState>> {
  const executionPlan =
    (await options.model.createPlan?.({
      messages: state.messages,
      userContext: state.userContext,
      requestContext: state.requestContext,
    })) ?? createFallbackPlan();

  const stepResults: StepExecutionResult[] = [];
  let retrievalContext = state.retrievalContext;

  for (const step of executionPlan.steps) {
    if (step.type === "retrieval") {
      if (!options.retriever) {
        notifyExternalWarning(options, {
          dependency: "retriever",
          code: "RETRIEVER_NOT_CONFIGURED",
          message: "Knowledge retrieval is not configured",
        });
        stepResults.push({
          stepId: step.id,
          type: step.type,
          status: "failed",
          error: "Retriever is not configured",
        });
        continue;
      }
      let chunks;
      try {
        chunks = await options.retriever.retrieve(
          step.instruction || getLastUserMessage(state.messages),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notifyExternalWarning(options, {
          dependency: "retriever",
          code: "RETRIEVER_UNAVAILABLE",
          message,
        });
        stepResults.push({
          stepId: step.id,
          type: step.type,
          status: "failed",
          error: message,
        });
        continue;
      }
      retrievalContext = [...retrievalContext, ...chunks];
      stepResults.push({
        stepId: step.id,
        type: step.type,
        status: "success",
        data: { chunks },
      });
      continue;
    }

    if (step.type === "mcp_tool") {
      if (!step.capability) {
        stepResults.push({
          stepId: step.id,
          type: step.type,
          status: "failed",
          error: "Tool step is missing capability",
        });
        continue;
      }
      if (!options.toolRegistry) {
        notifyExternalWarning(options, {
          dependency: "toolRegistry",
          code: "TOOL_REGISTRY_NOT_CONFIGURED",
          message: `Tool capability ${step.capability} is not configured`,
          capability: step.capability,
        });
        stepResults.push({
          stepId: step.id,
          type: step.type,
          capability: step.capability,
          status: "failed",
          error: `Tool capability ${step.capability} is not configured`,
        });
        continue;
      }
      let toolResponse;
      try {
        toolResponse = await options.toolRegistry.execute({
          capability: step.capability,
          messages: state.messages,
          userContext: state.userContext,
          requestContext: state.requestContext,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notifyExternalWarning(options, {
          dependency: "toolRegistry",
          code: "TOOL_EXECUTION_FAILED",
          message,
          capability: step.capability,
        });
        stepResults.push({
          stepId: step.id,
          type: step.type,
          capability: step.capability,
          status: "failed",
          error: message,
        });
        continue;
      }
      if (toolResponse.result?.status === "failed") {
        notifyExternalWarning(options, {
          dependency: "toolRegistry",
          code: "TOOL_EXECUTION_FAILED",
          message: toolResponse.result.error ?? "Tool execution failed",
          capability: step.capability,
        });
      }
      stepResults.push({
        stepId: step.id,
        type: step.type,
        capability: step.capability,
        status: toolResponse.result?.status ?? "success",
        data: toolResponse.result?.data ?? {
          action: toolResponse.actionSummary,
        },
        error: toolResponse.result?.error,
      });
      continue;
    }

    stepResults.push({
      stepId: step.id,
      type: step.type,
      status: "success",
      data: { instruction: step.instruction },
    });
  }

  return {
    executionPlan,
    retrievalContext,
    stepResults,
  };
}

function createFallbackPlan(): ExecutionPlan {
  return {
    goal: "Answer the user",
    steps: [
      { id: "analysis_1", type: "analysis", instruction: "Analyze request" },
    ],
    responseFormat: ["markdown"],
  };
}
