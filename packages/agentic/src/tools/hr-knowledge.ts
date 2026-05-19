import { runHrKnowledgeRetrievalPlan } from "../capabilities/hr-knowledge/index.js";
import type {
  HrDocumentRetrieverOptions,
  RetrievedDocument,
} from "../retrievers/hr-docs.js";
import type { AgenticEvidence } from "../state.js";

export interface HrKnowledgeAnswer {
  answer: string;
  documents: RetrievedDocument[];
  evidence?: AgenticEvidence;
  retrievedContext: string;
  warnings: string[];
  blocked?: boolean;
}

export async function answerHrKnowledgeQuestion(
  query: string,
): Promise<HrKnowledgeAnswer>;
export async function answerHrKnowledgeQuestion(
  query: string,
  options: HrDocumentRetrieverOptions,
): Promise<HrKnowledgeAnswer>;
export async function answerHrKnowledgeQuestion(
  query: string,
  options: HrDocumentRetrieverOptions = {},
): Promise<HrKnowledgeAnswer> {
  try {
    const result = await runHrKnowledgeRetrievalPlan({ query, options });

    if (result.blocked || result.documents.length === 0) {
      return {
        answer: result.retrievedContext,
        documents: result.documents,
        evidence: result.evidence,
        retrievedContext: result.retrievedContext,
        warnings:
          result.warnings.length > 0 ? result.warnings : ["HR_RETRIEVER_EMPTY"],
        blocked: true,
      };
    }

    return {
      answer: result.retrievedContext,
      documents: result.documents,
      evidence: result.evidence,
      retrievedContext: result.retrievedContext,
      warnings: result.warnings,
      blocked: false,
    };
  } catch (error) {
    return {
      answer: "",
      documents: [],
      retrievedContext: "",
      warnings: [
        `HR_RETRIEVER_UNAVAILABLE:${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    };
  }
}
