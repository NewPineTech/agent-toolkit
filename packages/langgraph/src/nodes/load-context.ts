import type { LangGraphWorkflowState } from "../state.js";

export async function loadContext(
  state: LangGraphWorkflowState,
): Promise<Partial<LangGraphWorkflowState>> {
  return {
    messages: state.messages,
    userContext: state.userContext,
    requestContext: state.requestContext,
  };
}
