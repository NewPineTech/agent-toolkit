export type HrRecruitmentCapabilityId =
  | "hr_recruitment.list_user_guide_pages"
  | "hr_recruitment.search_user_guide"
  | "hr_recruitment.get_user_guide_page"
  | "hr_recruitment.get_user_guide_section";

export interface RecruitmentGuideMcpPlanStep {
  capabilityId: HrRecruitmentCapabilityId;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface RecruitmentGuideMcpPlan {
  steps: RecruitmentGuideMcpPlanStep[];
  requiresModelAssistance: boolean;
}
