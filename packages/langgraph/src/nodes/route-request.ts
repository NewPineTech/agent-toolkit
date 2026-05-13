import type { LangGraphRuntimeOptions } from "../runtime.js";
import type { LangGraphWorkflowState } from "../state.js";

export async function routeRequest(
  state: LangGraphWorkflowState,
  options: LangGraphRuntimeOptions,
): Promise<Partial<LangGraphWorkflowState>> {
  const routeDecision = await options.model.classifyRoute({
    messages: state.messages,
    userContext: state.userContext,
    requestContext: state.requestContext,
  });

  return { routeDecision };
}
