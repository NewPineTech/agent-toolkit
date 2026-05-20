import { z } from "zod";
import { AGENTIC_INTENTS } from "../../constants.js";
import {
  retrieveHrForms,
  retrieveHrProcess,
  type HrDocumentRetrieverOptions,
} from "../../retrievers/hr-docs.js";
import type { AgenticCapability } from "../types.js";
import type {
  HrKnowledgeRetrievalInput,
  HrKnowledgeRetrievalOutput,
} from "./types.js";

export const HR_KNOWLEDGE_CAPABILITY_IDS = {
  retrieveProcess: "hr_knowledge.retrieve_process",
  retrieveForms: "hr_knowledge.retrieve_forms",
} as const;

const HrDocumentRetrieverOptionsSchema = z.custom<HrDocumentRetrieverOptions>();

const HrKnowledgeRetrievalInputSchema = z
  .object({
    query: z.string().min(1),
    options: HrDocumentRetrieverOptionsSchema.optional(),
  })
  .strict();

const RetrievedDocumentSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    score: z.number(),
    chunkId: z.string().optional(),
    documentId: z.string().optional(),
    sourceName: z.string().optional(),
    downloadUrl: z.string().optional(),
    originFileUrl: z.string().optional(),
    url: z.string().optional(),
    sourceUrl: z.string().optional(),
    fileUrl: z.string().optional(),
  })
  .passthrough();

const HrKnowledgeRetrievalOutputSchema = z
  .object({
    documents: z.array(RetrievedDocumentSchema),
  })
  .strict();

export function createHrKnowledgeCapabilities(): AgenticCapability<
  HrKnowledgeRetrievalInput,
  HrKnowledgeRetrievalOutput
>[] {
  return [
    {
      id: HR_KNOWLEDGE_CAPABILITY_IDS.retrieveProcess,
      intent: AGENTIC_INTENTS.hrKnowledgeQa,
      kind: "retriever",
      inputSchema: HrKnowledgeRetrievalInputSchema,
      outputSchema: HrKnowledgeRetrievalOutputSchema,
      safety: {
        readOnly: true,
        requiresApproval: false,
      },
      async execute(input) {
        return {
          documents: await retrieveHrProcess(input.query, input.options),
        };
      },
    },
    {
      id: HR_KNOWLEDGE_CAPABILITY_IDS.retrieveForms,
      intent: AGENTIC_INTENTS.hrKnowledgeQa,
      kind: "retriever",
      inputSchema: HrKnowledgeRetrievalInputSchema,
      outputSchema: HrKnowledgeRetrievalOutputSchema,
      safety: {
        readOnly: true,
        requiresApproval: false,
      },
      async execute(input) {
        return {
          documents: await retrieveHrForms(input.query, input.options),
        };
      },
    },
  ];
}
