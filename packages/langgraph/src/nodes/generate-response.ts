import type { LangGraphWorkflowState } from "../state.js";

export async function generateResponse(
  state: LangGraphWorkflowState,
): Promise<Partial<LangGraphWorkflowState>> {
  if (state.verification?.status === "failed") {
    return {
      finalAnswer:
        state.verification.reason ?? "The request failed verification.",
    };
  }

  return {};
}
