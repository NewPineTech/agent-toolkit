import { END, START, StateGraph } from "@langchain/langgraph";
import { AGENTIC_INTENTS } from "../constants.js";
import { loadPrompt } from "../prompt-loader.js";
import {
  AgenticStateAnnotation,
  createAgenticEvidenceFromDocuments,
  type AgenticState,
} from "../state.js";
import { answerHrKnowledgeQuestion } from "../tools/hr-knowledge.js";
import { generateModelResponse } from "../model.js";
import { buildMemoryContext } from "../memory.js";

async function hrKnowledgeQaNode(state: AgenticState) {
  const prompt = await loadPrompt("hr-knowledge-qa");
  const query = state.standaloneQuery ?? state.message;
  const result = await answerHrKnowledgeQuestion(query);
  const response = await generateModelResponse(
    {
      system: prompt,
      prompt: [
        `Question:\n${query}`,
        buildMemoryContext(state),
        `Retrieved context:\n${result.retrievedContext}`,
        result.warnings.length > 0
          ? `Retriever warnings:\n${result.warnings.join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    {
      temperature: 0.1,
      topP: 0.8,
      presencePenalty: null,
      frequencyPenalty: null,
      maxTokens: 1536,
    },
  );

  const warnings = uniqueWarnings([
    ...state.warnings,
    ...result.warnings,
    ...response.warnings,
  ]);

  return {
    workflowResults: [
      {
        intent: AGENTIC_INTENTS.hrKnowledgeQa,
        answer: response.content,
        warnings,
        evidence:
          result.evidence ??
          createAgenticEvidenceFromDocuments(result.documents, {
            toolName: "hr_knowledge_retriever",
            capabilityId: "hr_knowledge.retrieve_documents",
            warningCodes: result.warnings,
            missingEvidenceReason:
              "No HR knowledge documents were retrieved for this question.",
          }),
      },
    ],
    warnings,
  };
}

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings)];
}

export const hrKnowledgeQaGraph = new StateGraph(AgenticStateAnnotation)
  .addNode("hr_knowledge_answer", hrKnowledgeQaNode)
  .addEdge(START, "hr_knowledge_answer")
  .addEdge("hr_knowledge_answer", END)
  .compile();
