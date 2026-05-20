import type { AgenticMissingEvidence } from "../../state.js";
import { HR_KNOWLEDGE_CAPABILITY_IDS } from "./capabilities.js";
import type {
  HrKnowledgeVerifierInput,
  HrKnowledgeVerifierResult,
} from "./types.js";

export const HR_KNOWLEDGE_WARNINGS = {
  evidenceEmpty: "HR_KNOWLEDGE_EVIDENCE_EMPTY",
  processIncomplete: "HR_KNOWLEDGE_PROCESS_INCOMPLETE",
} as const;

export function verifyHrKnowledgeEvidence(
  input: HrKnowledgeVerifierInput,
): HrKnowledgeVerifierResult {
  const warnings: string[] = [];
  const missingEvidence: AgenticMissingEvidence[] = [];

  if (input.documents.length === 0) {
    warnings.push(HR_KNOWLEDGE_WARNINGS.evidenceEmpty);
    missingEvidence.push({
      reason: "No HR knowledge documents were retrieved for this question.",
      severity: "blocking",
    });
  }

  const processPlanned = input.plannedCapabilityIds.includes(
    HR_KNOWLEDGE_CAPABILITY_IDS.retrieveProcess,
  );
  const processDocuments = input.processDocuments ?? input.documents;
  const processLooksIncomplete =
    processPlanned && shouldRepairProcessRetrieval(processDocuments);

  if (processLooksIncomplete) {
    warnings.push(HR_KNOWLEDGE_WARNINGS.processIncomplete);
    missingEvidence.push({
      reason:
        "Retrieved process evidence appears to include only the first step.",
      severity: "blocking",
    });
  }

  return {
    blocked:
      warnings.length > 0 && (!processLooksIncomplete || input.repairAttempted),
    needsRepair: processLooksIncomplete && !input.repairAttempted,
    warnings,
    missingEvidence,
    confidenceSignals:
      warnings.length === 0
        ? [
            {
              label: "Retrieved HR knowledge evidence",
              direction: "supports",
              rationale: `${input.documents.length} document(s) available for answer generation.`,
            },
          ]
        : [],
  };
}

export function shouldRepairProcessRetrieval(
  documents: {
    content: string;
  }[],
): boolean {
  if (documents.length === 0) return false;

  const combinedContent = documents
    .map((document) => document.content)
    .join("\n")
    .toLowerCase();
  const declaredStepCount = extractDeclaredStepCount(combinedContent);
  const stepNumbers = extractStepNumbers(combinedContent);

  if (declaredStepCount && declaredStepCount > 1) {
    for (let stepNumber = 1; stepNumber <= declaredStepCount; stepNumber += 1) {
      if (!stepNumbers.has(stepNumber)) return true;
    }
    return false;
  }

  const hasStepOne = /\b(buoc|bước|step)\s*1\b/i.test(combinedContent);
  const hasLaterStep = [...stepNumbers].some((stepNumber) => stepNumber > 1);

  return hasStepOne && !hasLaterStep;
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

function extractStepNumbers(content: string): Set<number> {
  const normalized = normalizeSearchText(content);
  const labeledStepMatches = normalized.matchAll(
    /\b(?:buoc|step)\s*(\d{1,2})(?:\.\d+)?\b/g,
  );
  const numberedListMatches = normalized.matchAll(
    /(?:^|[\n\r]|[.;]\s+)(\d{1,2})[.)]\s+/g,
  );
  return new Set(
    [...labeledStepMatches, ...numberedListMatches]
      .map((match) => Number(match[1]))
      .filter((stepNumber) => Number.isInteger(stepNumber) && stepNumber > 0),
  );
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
