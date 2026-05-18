import { AGENTIC_INTENTS, type AgenticIntent } from "./constants.js";
import { loadPrompt } from "./prompt-loader.js";
import {
  generateModelResponse,
  isAgenticModelConfigured,
  type AgenticChatModel,
  type AgenticModelSettings,
} from "./model.js";

const recruitmentActionTerms = [
  "candidate",
  "candidates",
  "interview",
  "interviews",
  "ung vien",
  "phong van",
  "cv",
  "jd",
  "job",
  "jobs",
  "job description",
  "screen",
  "screening",
  "shortlist",
  "matching",
  "match",
  "pipeline",
  "status",
  "recruiter",
  "ho so",
  "vi tri",
  "sang loc",
];

const recruitmentDomainTerms = [
  "recruit",
  "recruitment",
  "hiring",
  "tuyen dung",
];

const knowledgeTerms = [
  "policy",
  "benefit",
  "leave",
  "salary",
  "allowance",
  "form",
  "template",
  "procedure",
  "process",
  "sop",
  "approval",
  "document",
  "documents",
  "resignation",
  "resign",
  "hr",
  "tai lieu",
  "tài liệu",
  "don",
  "đơn",
  "quy dinh",
  "chinh sach",
  "nghi phep",
  "nghi viec",
  "nghỉ việc",
  "phuc loi",
  "luong",
  "phu cap",
  "bieu mau",
  "mau don",
  "quy trinh",
  "thu tuc",
  "phe duyet",
  "steps",
];

export async function routeIntent(
  query: string,
  options: AgenticModelSettings & { model?: AgenticChatModel } = {},
): Promise<AgenticIntent[]> {
  const prompt = await loadPrompt("route-intent");

  if (options.model || isAgenticModelConfigured()) {
    const response = await generateModelResponse(
      {
        system: prompt,
        prompt: `Standalone query:\n${query}`,
      },
      {
        ...options,
        temperature: 0,
        topP: null,
        presencePenalty: null,
        frequencyPenalty: null,
        maxTokens: 64,
      },
    );
    const modelIntents = parseModelIntents(response.content);
    if (modelIntents.length > 0) {
      return repairIntentBoundary(query, modelIntents);
    }
  }

  const normalized = normalizeSearchText(query);
  const intents = new Set<AgenticIntent>();
  const hasKnowledgeSignal = includesAny(normalized, knowledgeTerms);
  const hasRecruitmentActionSignal = includesAny(
    normalized,
    recruitmentActionTerms,
  );
  const hasRecruitmentDomainSignal = includesAny(
    normalized,
    recruitmentDomainTerms,
  );

  if (
    hasKnowledgeSignal ||
    (hasRecruitmentDomainSignal && !hasRecruitmentActionSignal)
  ) {
    intents.add(AGENTIC_INTENTS.hrKnowledgeQa);
  }

  if (hasRecruitmentActionSignal) {
    intents.add(AGENTIC_INTENTS.hrRecruitment);
  }

  if (intents.size === 0) intents.add(AGENTIC_INTENTS.freeChat);
  return [...intents];
}

function repairIntentBoundary(
  query: string,
  modelIntents: AgenticIntent[],
): AgenticIntent[] {
  const normalized = normalizeSearchText(query);
  const hasKnowledgeSignal = includesAny(normalized, knowledgeTerms);
  const hasRecruitmentActionSignal = includesAny(
    normalized,
    recruitmentActionTerms,
  );
  const hasRecruitmentDomainSignal = includesAny(
    normalized,
    recruitmentDomainTerms,
  );

  if (
    (hasKnowledgeSignal || hasRecruitmentDomainSignal) &&
    !hasRecruitmentActionSignal &&
    modelIntents.includes(AGENTIC_INTENTS.hrRecruitment)
  ) {
    return [AGENTIC_INTENTS.hrKnowledgeQa];
  }

  return modelIntents;
}

function includesAny(normalizedQuery: string, terms: string[]): boolean {
  return terms.some((term) =>
    normalizedQuery.includes(normalizeSearchText(term)),
  );
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function routeNodeName(intents: AgenticIntent[]): string {
  if (intents.length > 1) return "multi_intent";
  return intents[0] ?? AGENTIC_INTENTS.freeChat;
}

export function parseModelIntents(content: string): AgenticIntent[] {
  const allowed = new Set<AgenticIntent>([
    AGENTIC_INTENTS.freeChat,
    AGENTIC_INTENTS.hrKnowledgeQa,
    AGENTIC_INTENTS.hrRecruitment,
  ]);
  const found: AgenticIntent[] = [];

  for (const token of content.split(/[^a-z_]+/i)) {
    if (!allowed.has(token as AgenticIntent)) continue;
    const intent = token as AgenticIntent;
    if (!found.includes(intent)) found.push(intent);
  }

  return found;
}
