import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { LangGraphRuntimeInput } from "../state.js";
import type { LangGraphRuntimeOptions } from "../runtime.js";
import { createInitialState, type LangGraphWorkflowState } from "../state.js";
import { answerKnowledge } from "../nodes/answer-knowledge.js";
import { generateResponse } from "../nodes/generate-response.js";
import { executePlan } from "../nodes/execute-plan.js";
import { loadContext } from "../nodes/load-context.js";
import { prepareToolAction } from "../nodes/prepare-tool-action.js";
import { routeRequest } from "../nodes/route-request.js";
import { unsupportedResponse } from "../nodes/unsupported-response.js";
import { verifyResult } from "../nodes/verify-result.js";

const WorkflowAnnotation = Annotation.Root({
  messages: Annotation<LangGraphWorkflowState["messages"]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  userContext: Annotation<LangGraphWorkflowState["userContext"]>(),
  requestContext: Annotation<LangGraphWorkflowState["requestContext"]>(),
  routeDecision: Annotation<LangGraphWorkflowState["routeDecision"]>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  retrievalContext: Annotation<LangGraphWorkflowState["retrievalContext"]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  toolPlan: Annotation<LangGraphWorkflowState["toolPlan"]>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  toolResult: Annotation<LangGraphWorkflowState["toolResult"]>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  executionPlan: Annotation<LangGraphWorkflowState["executionPlan"]>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  stepResults: Annotation<LangGraphWorkflowState["stepResults"]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  toolError: Annotation<LangGraphWorkflowState["toolError"]>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  verification: Annotation<LangGraphWorkflowState["verification"]>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  confirmation: Annotation<LangGraphWorkflowState["confirmation"]>({
    reducer: (_left, right) => right,
    default: () => ({ status: "not_required" }),
  }),
  finalAnswer: Annotation<LangGraphWorkflowState["finalAnswer"]>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
});

export interface CompiledLangGraphWorkflow {
  invoke(input: LangGraphRuntimeInput): Promise<LangGraphWorkflowState>;
}

export function buildLangGraphWorkflow(
  options: LangGraphRuntimeOptions,
): CompiledLangGraphWorkflow {
  const graph = buildLangGraphRunnableGraph(options) as {
    invoke(input: LangGraphWorkflowState): Promise<LangGraphWorkflowState>;
  };

  return {
    async invoke(input) {
      return graph.invoke(createInitialState(input));
    },
  };
}

export function buildLangGraphRunnableGraph(
  options: LangGraphRuntimeOptions,
): unknown {
  const graph = new StateGraph(WorkflowAnnotation)
    .addNode("load_context", loadContext)
    .addNode("route_request", (state) => routeRequest(state, options))
    .addNode("answer_knowledge", (state) => answerKnowledge(state, options))
    .addNode("execute_plan", (state) => executePlan(state, options))
    .addNode("prepare_tool_action", (state) =>
      prepareToolAction(state, options),
    )
    .addNode("unsupported_response", unsupportedResponse)
    .addNode("verify_result", verifyResult)
    .addNode("generate_response", generateResponse)
    .addEdge(START, "load_context")
    .addEdge("load_context", "route_request")
    .addConditionalEdges("route_request", selectRoute, {
      free_chat: "verify_result",
      knowledge_qa: "answer_knowledge",
      complex_analysis: "execute_plan",
      tool_task: "prepare_tool_action",
      tool_action: "prepare_tool_action",
      ticket_creation: "prepare_tool_action",
      report_generation: "prepare_tool_action",
      admin_action: "prepare_tool_action",
      clarification: "unsupported_response",
      unsupported: "unsupported_response",
    })
    .addEdge("answer_knowledge", "verify_result")
    .addEdge("execute_plan", "verify_result")
    .addEdge("prepare_tool_action", "verify_result")
    .addEdge("unsupported_response", "verify_result")
    .addEdge("verify_result", "generate_response")
    .addEdge("generate_response", END)
    .compile();

  return graph;
}

function selectRoute(state: LangGraphWorkflowState): string {
  const route = state.routeDecision?.route;
  if (
    route === "knowledge_qa" ||
    route === "free_chat" ||
    route === "complex_analysis" ||
    route === "tool_task" ||
    route === "tool_action" ||
    route === "ticket_creation" ||
    route === "report_generation" ||
    route === "admin_action" ||
    route === "clarification"
  ) {
    return route;
  }
  return "unsupported";
}
