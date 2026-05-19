import { describe, expect, it } from "vitest";
import {
  HR_RECRUITMENT_CAPABILITY_IDS,
  planRecruitmentGuideMcp,
} from "../index.js";

describe("Recruitment guide MCP planner", () => {
  it("plans guide page inventory requests with list_user_guide_pages", () => {
    const plan = planRecruitmentGuideMcp("Liệt kê các trang hướng dẫn hiện có");

    expect(plan.steps).toEqual([
      {
        capabilityId: HR_RECRUITMENT_CAPABILITY_IDS.listUserGuidePages,
        toolName: "list_user_guide_pages",
        arguments: {},
      },
    ]);
  });

  it("plans known guide page slug requests with get_user_guide_page", () => {
    const plan = planRecruitmentGuideMcp("Mở trang /jd-cv-matching");

    expect(plan.steps).toEqual([
      {
        capabilityId: HR_RECRUITMENT_CAPABILITY_IDS.getUserGuidePage,
        toolName: "get_user_guide_page",
        arguments: { slug: "/jd-cv-matching" },
      },
    ]);
  });

  it("plans known slug and heading requests with get_user_guide_section", () => {
    const plan = planRecruitmentGuideMcp(
      "Trong /jd-cv-matching, section Chấm điểm CV nói gì?",
    );

    expect(plan.steps).toEqual([
      {
        capabilityId: HR_RECRUITMENT_CAPABILITY_IDS.getUserGuideSection,
        toolName: "get_user_guide_section",
        arguments: {
          slug: "/jd-cv-matching",
          heading: "Chấm điểm CV",
        },
      },
    ]);
  });

  it("falls back to search for broad guide questions", () => {
    const plan = planRecruitmentGuideMcp("Làm sao tìm ứng viên theo email?");

    expect(plan.steps).toEqual([
      {
        capabilityId: HR_RECRUITMENT_CAPABILITY_IDS.searchUserGuide,
        toolName: "search_user_guide",
        arguments: {
          query: "Làm sao tìm ứng viên theo email?",
          limit: 3,
        },
      },
    ]);
    expect(plan.requiresModelAssistance).toBe(false);
  });

  it("keeps ambiguous multi-step requests on safe search and marks model assistance useful later", () => {
    const plan = planRecruitmentGuideMcp(
      "Tìm trang phù hợp rồi mở đúng section về email ứng viên",
    );

    expect(plan.steps[0]).toMatchObject({
      capabilityId: HR_RECRUITMENT_CAPABILITY_IDS.searchUserGuide,
      toolName: "search_user_guide",
    });
    expect(plan.requiresModelAssistance).toBe(true);
  });
});
