import { END, START, StateGraph } from "@langchain/langgraph";
import { AGENTIC_INTENTS } from "../constants.js";
import { loadPrompt } from "../prompt-loader.js";
import {
  AgenticStateAnnotation,
  createAgenticEvidenceFromDocuments,
  type AgenticState,
} from "../state.js";
import { answerRecruitmentQuestion } from "../tools/recruitment.js";
import { generateModelResponse } from "../model.js";
import { buildMemoryContext } from "../memory.js";

async function hrRecruitmentNode(state: AgenticState) {
  const prompt = await loadPrompt("hr-recruitment");
  const query = state.standaloneQuery ?? state.message;
  const result = await answerRecruitmentQuestion(query);
  const response = await generateModelResponse(
    {
      system: prompt,
      prompt: [
        `Question:\n${query}`,
        buildMemoryContext(state),
        `Recruitment context:\n${result.answer}`,
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
        intent: AGENTIC_INTENTS.hrRecruitment,
        answer: response.content,
        warnings,
        evidence: createAgenticEvidenceFromDocuments(result.documents, {
          toolName: "hr_recruitment_retriever",
          capabilityId: "hr_recruitment.retrieve_context",
          warningCodes: result.warnings,
          missingEvidenceReason:
            "No recruitment documents were retrieved for this question.",
        }),
      },
    ],
    warnings,
  };
}

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings)];
}

export const hrRecruitmentGraph = new StateGraph(AgenticStateAnnotation)
  .addNode("hr_recruitment_answer", hrRecruitmentNode)
  .addEdge(START, "hr_recruitment_answer")
  .addEdge("hr_recruitment_answer", END)
  .compile();
