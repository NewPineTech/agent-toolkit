import type { LangGraphWorkflowState } from "../state.js";

export async function unsupportedResponse(): Promise<
  Partial<LangGraphWorkflowState>
> {
  return {
    retrievalContext: [],
    finalAnswer:
      "I cannot safely handle that request with the configured capabilities.",
  };
}
