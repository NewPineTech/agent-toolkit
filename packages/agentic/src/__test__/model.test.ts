import { describe, expect, it, vi } from "vitest";
import { AGENTIC_DEFAULTS } from "../constants.js";

describe("agentic model wrapper", () => {
  it("degrades without creating a model when Vertex credentials are absent", async () => {
    const { createAgenticChatModel } = await import("../model.js");
    const warn = vi.fn();

    const result = createAgenticChatModel({
      env: {},
      warn,
    });

    expect(result.model).toBeUndefined();
    expect(result.warnings).toContain("MODEL_NOT_CONFIGURED");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Vertex"));
  });

  it("creates a Vertex chat model when the API key is configured", async () => {
    const { createAgenticChatModel } = await import("../model.js");
    const warn = vi.fn();

    const result = createAgenticChatModel({
      env: { GEMINI_VERTEX_API_KEY: "test-api-key" },
      warn,
    });

    expect(result.model).toBeDefined();
    expect(result.warnings).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("creates a Vertex chat model with current defaults and optional controls disabled", async () => {
    const { createAgenticChatModel } = await import("../model.js");

    const result = createAgenticChatModel({
      env: { GEMINI_VERTEX_API_KEY: "test-api-key" },
    });

    expect(result.model).toMatchObject({
      model: AGENTIC_DEFAULTS.model.name,
      temperature: 0.2,
      topP: undefined,
      presencePenalty: undefined,
      frequencyPenalty: undefined,
      maxOutputTokens: undefined,
    });
  });

  it("creates a Vertex chat model with customized generation settings", async () => {
    const { createAgenticChatModel } = await import("../model.js");

    const result = createAgenticChatModel({
      env: { GEMINI_VERTEX_API_KEY: "test-api-key" },
      modelName: "gemini-2.5-pro",
      temperature: 0.7,
      topP: 0.95,
      presencePenalty: 0.2,
      frequencyPenalty: 0.3,
      maxTokens: 2048,
    });

    expect(result.model).toMatchObject({
      model: "gemini-2.5-pro",
      temperature: 0.7,
      topP: 0.95,
      presencePenalty: 0.2,
      frequencyPenalty: 0.3,
      maxOutputTokens: 2048,
    });
  });

  it("does not expose a separate node model options helper", async () => {
    const modelModule = await import("../model.js");

    expect("createAgenticNodeModelOptions" in modelModule).toBe(false);
  });

  it("invokes the configured model with system and user prompts", async () => {
    const { generateModelResponse } = await import("../model.js");
    const invoke = vi.fn().mockResolvedValue({ content: "model answer" });

    const response = await generateModelResponse(
      {
        system: "system prompt",
        prompt: "user prompt",
      },
      {
        model: { invoke },
      },
    );

    expect(response).toEqual({ content: "model answer", warnings: [] });
    expect(invoke).toHaveBeenCalledWith([
      expect.objectContaining({ content: "system prompt" }),
      expect.objectContaining({ content: "user prompt" }),
    ]);
  });

  it("reports model invocation failures without throwing", async () => {
    const { generateModelResponse } = await import("../model.js");

    const response = await generateModelResponse(
      {
        system: "system prompt",
        prompt: "user prompt",
      },
      {
        model: {
          invoke: vi.fn().mockRejectedValue(new Error("upstream down")),
        },
      },
    );

    expect(response.content).toContain("user prompt");
    expect(response.warnings).toContain("MODEL_INVOKE_FAILED:upstream down");
  });
});
