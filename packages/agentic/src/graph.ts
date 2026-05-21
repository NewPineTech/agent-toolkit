import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { AGENTIC_INTENTS } from "./constants.js";
import { loadPrompt } from "./prompt-loader.js";
import {
  buildSavedMemoryState,
  trimConversationMessages,
  validateInput,
} from "./memory.js";
import { rewriteQueryFromMemory } from "./query-rewrite.js";
import { parseModelIntents, routeIntent, routeNodeName } from "./router.js";
import { generateModelResponse, isAgenticModelConfigured } from "./model.js";
import {
  AgenticInputSchema,
  AgenticStateAnnotation,
  type AgenticState,
} from "./state.js";
import { freeChatGraph } from "./workflows/free-chat.js";
import { hrKnowledgeQaGraph } from "./workflows/hr-knowledge-qa.js";
import { hrRecruitmentGraph } from "./workflows/hr-recruitment.js";
import { normalizeFinalAnswerMarkdown } from "./final-answer-format.js";

function validateInputNode(state: AgenticState) {
  validateInput(state);
  return { message: state.message.trim() };
}

function loadShortMemoryNode(state: AgenticState) {
  const trimmed = trimConversationMessages(state.messages);
  return {
    messages: trimmed,
    memorySummary: state.memorySummary,
    workflowResults: [],
    warnings: [],
    finalAnswer: undefined,
  };
}

async function rewriteQueryNode(state: AgenticState) {
  return {
    standaloneQuery: await rewriteQueryFromMemory(state),
  };
}

async function routeIntentNode(state: AgenticState) {
  return {
    selectedIntents: await routeIntent(state.standaloneQuery ?? state.message),
  };
}

async function maybePlanMultiIntentNode(state: AgenticState) {
  if (state.selectedIntents.length <= 1) return {};
  const prompt = await loadPrompt("multi-intent-planner");
  const warnings = [...state.warnings, "MULTI_INTENT_PLAN_APPLIED"];

  if (isAgenticModelConfigured()) {
    const response = await generateModelResponse(
      {
        system: prompt,
        prompt: [
          `Standalone query:\n${state.standaloneQuery ?? state.message}`,
          `Selected intents:\n${state.selectedIntents.join("\n")}`,
          state.memorySummary ? `Memory summary:\n${state.memorySummary}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
      {
        temperature: 0,
        topP: null,
        presencePenalty: null,
        frequencyPenalty: null,
        maxTokens: 96,
      },
    );

    const plannedIntents = parseModelIntents(response.content);
    return {
      selectedIntents:
        plannedIntents.length > 0 ? plannedIntents : state.selectedIntents,
      warnings: uniqueWarnings([...warnings, ...response.warnings]),
    };
  }

  return {
    warnings: uniqueWarnings(warnings),
  };
}

async function multiIntentNode(state: AgenticState) {
  const workflowResults = [];
  const warnings = [...state.warnings];
  const baseWarnings = [...state.warnings];

  if (state.selectedIntents.includes(AGENTIC_INTENTS.hrKnowledgeQa)) {
    const result = await hrKnowledgeQaGraph.invoke({
      ...state,
      workflowResults: [],
      warnings: baseWarnings,
    });
    workflowResults.push(...(result.workflowResults ?? []));
    warnings.push(...(result.warnings ?? []));
  }

  if (state.selectedIntents.includes(AGENTIC_INTENTS.hrRecruitment)) {
    const result = await hrRecruitmentGraph.invoke({
      ...state,
      workflowResults: [],
      warnings: baseWarnings,
    });
    workflowResults.push(...(result.workflowResults ?? []));
    warnings.push(...(result.warnings ?? []));
  }

  return { workflowResults, warnings: uniqueWarnings(warnings) };
}

async function synthesizeFinalAnswerNode(state: AgenticState) {
  const prompt = await loadPrompt("synthesize-final-answer");
  if (state.workflowResults.length === 0) {
    if (!isAgenticModelConfigured()) return { finalAnswer: "" };
  }

  if (state.workflowResults.some(hasBlockingEvidence)) {
    return {
      finalAnswer: normalizeFinalAnswerMarkdown(
        state.workflowResults
          .map((result) => result.answer)
          .filter(Boolean)
          .join("\n\n"),
      ),
    };
  }

  if (isAgenticModelConfigured()) {
    const response = await generateModelResponse(
      {
        system: prompt,
        prompt: [
          `Original message:\n${state.message}`,
          state.standaloneQuery
            ? `Standalone query:\n${state.standaloneQuery}`
            : "",
          `Workflow results:\n${JSON.stringify(state.workflowResults, null, 2)}`,
          state.warnings.length > 0
            ? `Warnings:\n${state.warnings.join("\n")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
      {
        temperature: 0.2,
        topP: 0.85,
        presencePenalty: null,
        frequencyPenalty: null,
        maxTokens: 2048,
      },
    );

    return {
      finalAnswer: normalizeFinalAnswerMarkdown(response.content),
      warnings: uniqueWarnings([...state.warnings, ...response.warnings]),
    };
  }

  return {
    finalAnswer: normalizeFinalAnswerMarkdown(
      state.workflowResults
        .map((result) => result.answer)
        .filter(Boolean)
        .join("\n\n"),
    ),
  };
}

async function saveShortMemoryNode(state: AgenticState) {
  return buildSavedMemoryState(state);
}

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings)];
}

function hasBlockingEvidence(
  result: AgenticState["workflowResults"][number],
): boolean {
  return result.evidence.missingEvidence.some(
    (missingEvidence) => missingEvidence.severity === "blocking",
  );
}

const builder = new StateGraph(AgenticStateAnnotation, {
  input: AgenticInputSchema,
})
  .addNode("validate_input", validateInputNode)
  .addNode("load_short_memory", loadShortMemoryNode)
  .addNode("rewrite_query", rewriteQueryNode)
  .addNode("route_intent", routeIntentNode)
  .addNode("maybe_plan_multi_intent", maybePlanMultiIntentNode)
  .addNode("free_chat", freeChatGraph as never)
  .addNode("hr_knowledge_qa", hrKnowledgeQaGraph as never)
  .addNode("hr_recruitment", hrRecruitmentGraph as never)
  .addNode("multi_intent", multiIntentNode)
  .addNode("synthesize_final_answer", synthesizeFinalAnswerNode)
  .addNode("save_short_memory", saveShortMemoryNode)
  .addEdge(START, "validate_input")
  .addEdge("validate_input", "load_short_memory")
  .addEdge("load_short_memory", "rewrite_query")
  .addEdge("rewrite_query", "route_intent")
  .addEdge("route_intent", "maybe_plan_multi_intent")
  .addConditionalEdges("maybe_plan_multi_intent", (state) =>
    routeNodeName(state.selectedIntents),
  )
  .addEdge("free_chat", "synthesize_final_answer")
  .addEdge("hr_knowledge_qa", "synthesize_final_answer")
  .addEdge("hr_recruitment", "synthesize_final_answer")
  .addEdge("multi_intent", "synthesize_final_answer")
  .addEdge("synthesize_final_answer", "save_short_memory")
  .addEdge("save_short_memory", END);

export const hrAssistantGraph = builder.compile({
  checkpointer: new MemorySaver(),
});
