import { AGENTIC_MCP_REGISTRY } from "../../constants.js";
import type {
  HrRecruitmentCapabilityId,
  RecruitmentGuideMcpPlan,
  RecruitmentGuideMcpPlanStep,
} from "./types.js";

export const HR_RECRUITMENT_CAPABILITY_IDS = {
  listUserGuidePages: "hr_recruitment.list_user_guide_pages",
  searchUserGuide: "hr_recruitment.search_user_guide",
  getUserGuidePage: "hr_recruitment.get_user_guide_page",
  getUserGuideSection: "hr_recruitment.get_user_guide_section",
} as const satisfies Record<string, HrRecruitmentCapabilityId>;

const GUIDE_TOOLS = AGENTIC_MCP_REGISTRY.aiRecruitment.allowedTools;

export function planRecruitmentGuideMcp(
  query: string,
  limit: number = AGENTIC_MCP_REGISTRY.aiRecruitment.searchLimit,
): RecruitmentGuideMcpPlan {
  const slug = extractSlug(query);
  const heading = extractHeading(query);

  if (slug && heading) {
    return buildPlan({
      capabilityId: HR_RECRUITMENT_CAPABILITY_IDS.getUserGuideSection,
      toolName: GUIDE_TOOLS.getUserGuideSection.name,
      arguments: { slug, heading },
    });
  }

  if (slug) {
    return buildPlan({
      capabilityId: HR_RECRUITMENT_CAPABILITY_IDS.getUserGuidePage,
      toolName: GUIDE_TOOLS.getUserGuidePage.name,
      arguments: { slug },
    });
  }

  if (isGuideInventoryRequest(query)) {
    return buildPlan({
      capabilityId: HR_RECRUITMENT_CAPABILITY_IDS.listUserGuidePages,
      toolName: GUIDE_TOOLS.listUserGuidePages.name,
      arguments: {},
    });
  }

  return buildPlan(
    {
      capabilityId: HR_RECRUITMENT_CAPABILITY_IDS.searchUserGuide,
      toolName: GUIDE_TOOLS.searchUserGuide.name,
      arguments: { query, limit },
    },
    isAmbiguousMultiStepRequest(query),
  );
}

function buildPlan(
  step: RecruitmentGuideMcpPlanStep,
  requiresModelAssistance: boolean = false,
): RecruitmentGuideMcpPlan {
  return {
    steps: [step],
    requiresModelAssistance,
  };
}

function isGuideInventoryRequest(query: string): boolean {
  const normalized = normalizeSearchText(query);
  return (
    includesAny(normalized, [
      "available pages",
      "danh sach trang",
      "huong dan hien co",
      "liet ke",
      "list pages",
      "muc luc",
      "trang huong dan",
    ]) && !extractSlug(query)
  );
}

function isAmbiguousMultiStepRequest(query: string): boolean {
  const normalized = normalizeSearchText(query);
  return includesAny(normalized, [
    "dung section",
    "mo dung",
    "open the right",
    "roi mo",
    "search then",
    "tim trang phu hop",
  ]);
}

function extractSlug(query: string): string | undefined {
  const match =
    query.match(
      /(?:slug\s*[:=]\s*|trang\s+|page\s+)?(\/[a-z0-9][a-z0-9-_/]*)/i,
    ) ?? query.match(/slug\s*[:=]\s*([a-z0-9][a-z0-9-_/]*)/i);
  const slug = match?.[1]?.trim();
  if (!slug) return undefined;
  return slug.startsWith("/") ? slug : `/${slug}`;
}

function extractHeading(query: string): string | undefined {
  const sectionMatch = query.match(
    /(?:section|heading|mục|muc|phần|phan)\s+([^?.,:;]+?)(?:\s+(?:nói|noi|la|là|trong|ở|o)\b|[?.,:;]|$)/i,
  );
  const heading = sectionMatch?.[1]?.trim();
  return heading && heading.length > 0 ? heading : undefined;
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
