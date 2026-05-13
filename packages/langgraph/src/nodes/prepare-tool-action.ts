import type { LangGraphRuntimeOptions } from "../runtime.js";
import { LangGraphWorkflowError, notifyExternalWarning } from "../runtime.js";
import type { LangGraphWorkflowState } from "../state.js";

export async function prepareToolAction(
  state: LangGraphWorkflowState,
  options: LangGraphRuntimeOptions,
): Promise<Partial<LangGraphWorkflowState>> {
  const capability = state.routeDecision?.capability;
  if (!capability) {
    throw new LangGraphWorkflowError(
      "TOOL_CAPABILITY_MISSING",
      "Tool action route requires a capability",
    );
  }

  if (!options.toolRegistry) {
    notifyExternalWarning(options, {
      dependency: "toolRegistry",
      code: "TOOL_REGISTRY_NOT_CONFIGURED",
      message: `Tool capability ${capability} is not configured`,
    });
    return {};
  }

  let response;
  try {
    response = await options.toolRegistry.execute({
      capability,
      messages: state.messages,
      userContext: state.userContext,
      requestContext: state.requestContext,
    });
  } catch (error) {
    notifyExternalWarning(options, {
      dependency: "toolRegistry",
      code: "TOOL_EXECUTION_FAILED",
      message: error instanceof Error ? error.message : String(error),
      capability,
    });
    return {};
  }

  if (response.result?.status === "failed") {
    notifyExternalWarning(options, {
      dependency: "toolRegistry",
      code: "TOOL_EXECUTION_FAILED",
      message: response.result.error ?? "Tool execution failed",
      capability,
    });
    return {};
  }

  return {
    toolPlan: {
      capability,
      toolName: response.toolName,
      args: response.args,
      actionSummary: response.actionSummary,
      riskLevel: response.riskLevel,
      requiresConfirmation: response.requiresConfirmation,
    },
    confirmation: response.requiresConfirmation
      ? {
          status: "pending",
          summary: response.actionSummary,
        }
      : {
          status: "not_required",
        },
    toolResult: response.result,
  };
}
