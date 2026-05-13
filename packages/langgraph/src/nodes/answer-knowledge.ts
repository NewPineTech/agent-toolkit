import type { LangGraphRuntimeOptions } from "../runtime.js";
import { notifyExternalWarning } from "../runtime.js";
import { getLastUserMessage, type LangGraphWorkflowState } from "../state.js";

export async function answerKnowledge(
  state: LangGraphWorkflowState,
  options: LangGraphRuntimeOptions,
): Promise<Partial<LangGraphWorkflowState>> {
  if (!options.retriever) {
    notifyExternalWarning(options, {
      dependency: "retriever",
      code: "RETRIEVER_NOT_CONFIGURED",
      message: "Knowledge retrieval is not configured",
    });
    return { retrievalContext: [] };
  }

  const query = getLastUserMessage(state.messages);
  try {
    const retrievalContext = await options.retriever.retrieve(query);

    return { retrievalContext };
  } catch (error) {
    notifyExternalWarning(options, {
      dependency: "retriever",
      code: "RETRIEVER_UNAVAILABLE",
      message: error instanceof Error ? error.message : String(error),
    });
    return { retrievalContext: [] };
  }
}
