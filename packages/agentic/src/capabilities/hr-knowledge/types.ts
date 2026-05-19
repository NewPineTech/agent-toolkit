import type {
  AgenticConfidenceSignal,
  AgenticEvidence,
  AgenticMissingEvidence,
} from "../../state.js";
import type {
  HrDocumentRetrieverOptions,
  RetrievedDocument,
} from "../../retrievers/hr-docs.js";

export type HrKnowledgeCapabilityId =
  | "hr_knowledge.retrieve_process"
  | "hr_knowledge.retrieve_forms";

export interface HrKnowledgeRetrievalInput {
  query: string;
  options?: HrDocumentRetrieverOptions;
}

export interface HrKnowledgeRetrievalOutput {
  documents: RetrievedDocument[];
}

export interface HrKnowledgePlanStep {
  capabilityId: HrKnowledgeCapabilityId;
  input: HrKnowledgeRetrievalInput;
}

export interface HrKnowledgeRetrievalPlan {
  steps: HrKnowledgePlanStep[];
  requiresModelAssistance: boolean;
}

export interface HrKnowledgeVerifierInput {
  query: string;
  documents: RetrievedDocument[];
  processDocuments?: RetrievedDocument[];
  plannedCapabilityIds: HrKnowledgeCapabilityId[];
  repairAttempted: boolean;
}

export interface HrKnowledgeVerifierResult {
  blocked: boolean;
  needsRepair: boolean;
  warnings: string[];
  missingEvidence: AgenticMissingEvidence[];
  confidenceSignals: AgenticConfidenceSignal[];
}

export interface HrKnowledgePlanRunInput {
  query: string;
  options?: HrDocumentRetrieverOptions;
}

export interface HrKnowledgePlanRunResult {
  documents: RetrievedDocument[];
  retrievedContext: string;
  warnings: string[];
  evidence: AgenticEvidence;
  blocked: boolean;
}
