import { describe, expect, it } from "vitest";
import {
  buildAnswerPrompt,
  buildPlannerPrompt,
  buildResponseFormatRules,
  buildRouteClassificationPrompt,
  buildToolSelectionPrompt,
  buildVerificationPrompt,
} from "../index.js";

const routeInput = {
  messages: [{ role: "user" as const, content: "Find candidates for a JD" }],
  userContext: {
    userId: "user_1",
    role: "widget_user",
    permissions: ["docs:read", "ai-recruitment.search"],
  },
  requestContext: {
    sessionId: "session_1",
    requestId: "request_1",
  },
};

describe("LangGraph prompt registry", () => {
  it("builds a router prompt with expanded route and JSON instructions", () => {
    const prompt = buildRouteClassificationPrompt(routeInput);

    expect(prompt).toContain("Return only JSON");
    expect(prompt).toContain("free_chat");
    expect(prompt).toContain("complex_analysis");
    expect(prompt).toContain("tool_task");
  });

  it("builds answer prompts with markdown references and artifact rules", () => {
    const prompt = buildAnswerPrompt({
      messages: routeInput.messages,
      contexts: [{ content: "Policy", source: "policy.md" }],
      routeDecision: {
        route: "knowledge_qa",
        confidence: 0.9,
        reason: "test",
      },
      toolResults: [],
    });

    expect(prompt).toContain("Use Markdown");
    expect(prompt).toContain("do not invent references");
    expect(prompt).toContain("Context:");
  });

  it("builds planner and tool prompts with strict JSON contracts", () => {
    expect(buildPlannerPrompt(routeInput)).toContain("Return only JSON");
    expect(
      buildToolSelectionPrompt(routeInput, [
        {
          capability: "ai-recruitment.search_candidates",
          name: "Search candidates",
          readOnly: true,
        },
      ]),
    ).toContain("ai-recruitment.search_candidates");
  });

  it("builds response and verification rules for artifacts and references", () => {
    expect(buildResponseFormatRules()).toContain("Chart artifacts");
    expect(buildResponseFormatRules()).toContain("Image artifacts");
    expect(buildVerificationPrompt()).toContain("references are invented");
  });
});
