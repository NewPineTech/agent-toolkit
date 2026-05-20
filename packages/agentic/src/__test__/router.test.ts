import { describe, expect, it, vi } from "vitest";
import { AGENTIC_INTENTS } from "../constants.js";
import { parseModelIntents, routeIntent, routeNodeName } from "../router.js";

describe("intent router", () => {
  it("routes free chat by default", async () => {
    await expect(routeIntent("hello there")).resolves.toEqual([
      AGENTIC_INTENTS.freeChat,
    ]);
  });

  it("routes personal identity questions to free chat", async () => {
    await expect(routeIntent("tôi là ai")).resolves.toEqual([
      AGENTIC_INTENTS.freeChat,
    ]);
  });

  it("routes HR knowledge questions", async () => {
    await expect(routeIntent("leave policy la gi")).resolves.toEqual([
      AGENTIC_INTENTS.hrKnowledgeQa,
    ]);
  });

  it("routes form and procedure questions into the single HR knowledge workflow", async () => {
    await expect(
      routeIntent("cho toi bieu mau va quy trinh nghi phep"),
    ).resolves.toEqual([AGENTIC_INTENTS.hrKnowledgeQa]);
  });

  it("routes recruitment process questions to HR knowledge", async () => {
    await expect(
      routeIntent("Quy trình tuyển dụng gồm các bước nào?"),
    ).resolves.toEqual([AGENTIC_INTENTS.hrKnowledgeQa]);

    await expect(
      routeIntent("What are the recruitment process steps?"),
    ).resolves.toEqual([AGENTIC_INTENTS.hrKnowledgeQa]);
  });

  it("routes Vietnamese document and resignation form lookup to HR knowledge", async () => {
    await expect(
      routeIntent('tìm tài liệu "đơn xin nghỉ việc"'),
    ).resolves.toEqual([AGENTIC_INTENTS.hrKnowledgeQa]);
  });

  it("routes recruitment questions", async () => {
    await expect(routeIntent("screen candidate CV")).resolves.toEqual([
      AGENTIC_INTENTS.hrRecruitment,
    ]);
  });

  it("routes mixed questions through multi intent", async () => {
    const intents = await routeIntent("leave policy for candidate interview");

    expect(intents).toEqual([
      AGENTIC_INTENTS.hrKnowledgeQa,
      AGENTIC_INTENTS.hrRecruitment,
    ]);
    expect(routeNodeName(intents)).toBe("multi_intent");
  });

  it("uses the configured model for intent routing when available", async () => {
    const invoke = vi.fn().mockResolvedValue({
      content: "hr_recruitment\nhr_knowledge_qa",
    });

    await expect(
      routeIntent("compare candidate leave policy fit", {
        model: { invoke },
      }),
    ).resolves.toEqual([
      AGENTIC_INTENTS.hrRecruitment,
      AGENTIC_INTENTS.hrKnowledgeQa,
    ]);
    expect(invoke).toHaveBeenCalled();
  });

  it("repairs model routes for recruitment process knowledge questions", async () => {
    const invoke = vi.fn().mockResolvedValue({
      content: "hr_recruitment",
    });

    await expect(
      routeIntent("Quy trình tuyển dụng gồm các bước nào?", {
        model: { invoke },
      }),
    ).resolves.toEqual([AGENTIC_INTENTS.hrKnowledgeQa]);
    expect(invoke).toHaveBeenCalled();
  });

  it("parses model intent plans in order without duplicates", () => {
    expect(
      parseModelIntents("hr_recruitment\nhr_knowledge_qa\nhr_recruitment"),
    ).toEqual([AGENTIC_INTENTS.hrRecruitment, AGENTIC_INTENTS.hrKnowledgeQa]);
  });
});
