import { HR_KNOWLEDGE_CAPABILITY_IDS } from "./capabilities.js";
import type {
  HrKnowledgePlanStep,
  HrKnowledgeRetrievalInput,
  HrKnowledgeRetrievalPlan,
} from "./types.js";

export function planHrKnowledgeRetrieval(
  query: string,
  input: HrKnowledgeRetrievalInput = { query },
): HrKnowledgeRetrievalPlan {
  const mode = selectHrRetrievalMode(query);
  const steps: HrKnowledgePlanStep[] = [];

  if (mode === "process" || mode === "both") {
    steps.push({
      capabilityId: HR_KNOWLEDGE_CAPABILITY_IDS.retrieveProcess,
      input,
    });
  }

  if (mode === "forms" || mode === "both") {
    steps.push({
      capabilityId: HR_KNOWLEDGE_CAPABILITY_IDS.retrieveForms,
      input,
    });
  }

  return {
    steps,
    requiresModelAssistance: false,
  };
}

type HrRetrievalMode = "forms" | "process" | "both";

function selectHrRetrievalMode(query: string): HrRetrievalMode {
  const normalized = normalizeSearchText(query);
  const hasProcessSignal = includesAny(normalized, [
    "approval",
    "approver",
    "cac buoc",
    "phe duyet",
    "process",
    "procedure",
    "quy trinh",
    "sop",
    "step",
    "steps",
    "thu tuc",
  ]);
  const hasFormSignal = includesAny(normalized, [
    "bieu mau",
    "code",
    "don",
    "download",
    "form",
    "link",
    "mau",
    "phieu",
    "template",
    "url",
  ]);

  if (hasProcessSignal && hasFormSignal) return "both";
  if (hasFormSignal) return "forms";
  if (hasProcessSignal) return "process";
  return "both";
}

function includesAny(normalizedQuery: string, terms: string[]): boolean {
  return terms.some((term) => normalizedQuery.includes(term));
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
