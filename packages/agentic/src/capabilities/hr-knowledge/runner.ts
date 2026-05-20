import {
  createAgenticCapabilityRegistry,
  executeAgenticCapability,
} from "../index.js";
import {
  createAgenticEvidenceFromDocuments,
  type AgenticEvidence,
} from "../../state.js";
import { createHrKnowledgeCapabilities } from "./capabilities.js";
import { planHrKnowledgeRetrieval } from "./planner.js";
import { verifyHrKnowledgeEvidence } from "./verifier.js";
import type {
  HrKnowledgeCapabilityId,
  HrKnowledgePlanRunInput,
  HrKnowledgePlanRunResult,
  HrKnowledgeRetrievalOutput,
} from "./types.js";

export async function runHrKnowledgeRetrievalPlan(
  input: HrKnowledgePlanRunInput,
): Promise<HrKnowledgePlanRunResult> {
  const registry = createAgenticCapabilityRegistry(
    createHrKnowledgeCapabilities(),
  );
  const plan = planHrKnowledgeRetrieval(input.query, {
    query: input.query,
    options: input.options,
  });
  const firstRun = await executePlan(registry, plan.steps);
  const firstVerification = verifyHrKnowledgeEvidence({
    query: input.query,
    documents: firstRun.documents,
    processDocuments:
      firstRun.documentsByCapability["hr_knowledge.retrieve_process"] ?? [],
    plannedCapabilityIds: plan.steps.map((step) => step.capabilityId),
    repairAttempted: false,
  });

  if (firstVerification.needsRepair) {
    const repairedPlan = {
      ...plan,
      steps: plan.steps.filter(
        (step) => step.capabilityId === "hr_knowledge.retrieve_process",
      ),
    };
    const repairedRun = await executePlan(
      registry,
      repairedPlan.steps.map((step) => ({
        ...step,
        input: {
          ...step.input,
          query: buildProcessRepairQuery(
            step.input.query,
            firstRun.documentsByCapability["hr_knowledge.retrieve_process"] ??
              [],
          ),
          options: {
            ...step.input.options,
            pageSize: Math.max(step.input.options?.pageSize ?? 0, 32),
          },
        },
      })),
    );
    const repairedProcessDocuments =
      repairedRun.documentsByCapability["hr_knowledge.retrieve_process"] ?? [];
    const processDocuments = dedupeDocuments([
      ...repairedProcessDocuments,
      ...(firstRun.documentsByCapability["hr_knowledge.retrieve_process"] ??
        []),
    ]);
    const documents = dedupeDocuments([
      ...processDocuments,
      ...(firstRun.documentsByCapability["hr_knowledge.retrieve_forms"] ?? []),
    ]);
    const verification = verifyHrKnowledgeEvidence({
      query: input.query,
      documents,
      processDocuments,
      plannedCapabilityIds: plan.steps.map((step) => step.capabilityId),
      repairAttempted: true,
    });

    return buildRunResult({
      documents,
      warnings: uniqueWarnings([
        ...firstRun.warnings,
        ...repairedRun.warnings,
        ...verification.warnings,
      ]),
      evidence: mergeEvidence(
        documents,
        [...firstRun.toolCalls, ...repairedRun.toolCalls],
        verification,
      ),
      blocked: verification.blocked,
    });
  }

  return buildRunResult({
    documents: firstRun.documents,
    warnings: uniqueWarnings([
      ...firstRun.warnings,
      ...firstVerification.warnings,
    ]),
    evidence: mergeEvidence(
      firstRun.documents,
      firstRun.toolCalls,
      firstVerification,
    ),
    blocked: firstVerification.blocked,
  });
}

async function executePlan(
  registry: ReturnType<typeof createAgenticCapabilityRegistry>,
  steps: {
    capabilityId: HrKnowledgeCapabilityId;
    input: unknown;
  }[],
): Promise<{
  documents: HrKnowledgeRetrievalOutput["documents"];
  toolCalls: AgenticEvidence["toolCalls"];
  warnings: string[];
  documentsByCapability: Partial<
    Record<HrKnowledgeCapabilityId, HrKnowledgeRetrievalOutput["documents"]>
  >;
}> {
  const documents: HrKnowledgeRetrievalOutput["documents"] = [];
  const documentsByCapability: Partial<
    Record<HrKnowledgeCapabilityId, HrKnowledgeRetrievalOutput["documents"]>
  > = {};
  const toolCalls: AgenticEvidence["toolCalls"] = [];
  const warnings: string[] = [];

  for (const step of steps) {
    const result = await executeAgenticCapability<HrKnowledgeRetrievalOutput>(
      registry,
      {
        capabilityId: step.capabilityId,
        input: step.input,
        maxSteps: 1,
      },
    );

    warnings.push(...result.warningCodes);
    toolCalls.push(...result.evidence.toolCalls);
    if (result.status === "success") {
      const stepDocuments = result.output?.documents ?? [];
      documentsByCapability[step.capabilityId] = dedupeDocuments([
        ...(documentsByCapability[step.capabilityId] ?? []),
        ...stepDocuments,
      ]);
      documents.push(...stepDocuments);
    }
  }

  return {
    documents: dedupeDocuments(documents),
    documentsByCapability,
    toolCalls,
    warnings: uniqueWarnings(warnings),
  };
}

function buildRunResult(input: {
  documents: HrKnowledgeRetrievalOutput["documents"];
  warnings: string[];
  evidence: AgenticEvidence;
  blocked: boolean;
}): HrKnowledgePlanRunResult {
  return {
    documents: input.documents,
    retrievedContext: input.blocked
      ? ""
      : formatRetrievedContext(input.documents),
    warnings: input.warnings,
    evidence: input.evidence,
    blocked: input.blocked,
  };
}

function mergeEvidence(
  documents: HrKnowledgeRetrievalOutput["documents"],
  toolCalls: AgenticEvidence["toolCalls"],
  verification: ReturnType<typeof verifyHrKnowledgeEvidence>,
): AgenticEvidence {
  const evidence = createAgenticEvidenceFromDocuments(documents, {
    toolName: "hr_knowledge_retriever",
    capabilityId: "hr_knowledge.retrieve_plan",
    warningCodes: verification.warnings,
    missingEvidenceReason:
      "No HR knowledge documents were retrieved for this question.",
  });

  evidence.toolCalls.push(...toolCalls);
  evidence.missingEvidence = verification.missingEvidence;
  evidence.confidenceSignals = verification.confidenceSignals;

  return evidence;
}

function dedupeDocuments(
  documents: HrKnowledgeRetrievalOutput["documents"],
): HrKnowledgeRetrievalOutput["documents"] {
  const seen = new Set<string>();
  const result: HrKnowledgeRetrievalOutput["documents"] = [];

  for (const document of documents) {
    const key =
      document.chunkId ??
      document.id ??
      document.documentId ??
      `${document.title}\n${document.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(document);
  }

  return result;
}

function formatRetrievedContext(
  documents: HrKnowledgeRetrievalOutput["documents"],
): string {
  return documents.map(formatDocumentContext).join("\n");
}

function formatDocumentContext(
  document: HrKnowledgeRetrievalOutput["documents"][number],
): string {
  const metadata = [
    document.documentId ? `document_id=${document.documentId}` : "",
    document.chunkId ? `chunk_id=${document.chunkId}` : "",
    firstSourceUrl(document) ? `source_url=${firstSourceUrl(document)}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  const suffix = metadata ? ` (${metadata})` : "";

  return `${document.title}${suffix}: ${document.content}`;
}

function buildProcessRepairQuery(
  query: string,
  documents: HrKnowledgeRetrievalOutput["documents"],
): string {
  const titles = uniqueStrings(
    documents.map((document) => document.title).filter(Boolean),
  );
  const declaredStepCount = extractDeclaredStepCount(
    documents.map((document) => document.content).join("\n"),
  );
  const expectedSteps = declaredStepCount
    ? Array.from(
        { length: declaredStepCount },
        (_, index) => `Bước ${index + 1}`,
      ).join("; ")
    : "Bước 1; Bước 2; Bước 3; Bước 4; Bước 5; Bước 6; Bước 7";

  return [
    query,
    titles.length > 0
      ? `Ưu tiên các tài liệu quy trình: ${titles.join(", ")}.`
      : "",
    declaredStepCount
      ? `Cần truy xuất đủ ${declaredStepCount} bước của quy trình: ${expectedSteps}.`
      : `Cần truy xuất đầy đủ danh sách bước của quy trình: ${expectedSteps}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function extractDeclaredStepCount(content: string): number | undefined {
  const normalized = normalizeSearchText(content);
  const matches = [
    ...normalized.matchAll(/\btong so buoc\s*:?\s*(\d{1,2})\b/g),
    ...normalized.matchAll(/\bincludes\s+(\d{1,2})\s+steps?\b/g),
    ...normalized.matchAll(/\bgom\s+(\d{1,2})\s+buoc\b/g),
    ...normalized.matchAll(/\bco\s+(\d{1,2})\s+buoc\b/g),
  ];
  const counts = matches
    .map((match) => Number(match[1]))
    .filter((count) => Number.isInteger(count) && count > 1 && count <= 50);

  return counts.length > 0 ? Math.max(...counts) : undefined;
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function firstSourceUrl(
  document: HrKnowledgeRetrievalOutput["documents"][number],
): string | undefined {
  return (
    document.downloadUrl ??
    document.originFileUrl ??
    document.url ??
    document.sourceUrl ??
    document.fileUrl
  );
}

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings)];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
