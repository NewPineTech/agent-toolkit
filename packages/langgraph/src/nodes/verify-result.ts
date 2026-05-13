import type { LangGraphWorkflowState } from "../state.js";

export async function verifyResult(
  state: LangGraphWorkflowState,
): Promise<Partial<LangGraphWorkflowState>> {
  if (state.toolResult?.status === "failed") {
    return {
      verification: {
        status: "failed",
        reason: state.toolResult.error ?? "Tool execution failed",
      },
    };
  }

  return {
    verification: {
      status: "passed",
    },
  };
}
