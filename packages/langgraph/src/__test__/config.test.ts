import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEMINI_MODEL,
  parseLangGraphProviderConfig,
} from "../config.js";

describe("parseLangGraphProviderConfig", () => {
  it("normalizes a production LangGraph provider config", () => {
    expect(
      parseLangGraphProviderConfig({
        model: { provider: "gemini", model: DEFAULT_GEMINI_MODEL },
        ragflow: {
          baseUrl: "https://ragflow.example.com/",
          datasetIds: ["kb_1"],
          topK: 8,
          similarityThreshold: 0.42,
        },
        tools: { enabled: ["docs.search"] },
        memory: { shortTerm: true, longTerm: false },
        systemPrompt: "Use approved sources.",
      }),
    ).toEqual({
      model: { provider: "gemini", model: DEFAULT_GEMINI_MODEL },
      ragflow: {
        baseUrl: "https://ragflow.example.com/",
        datasetIds: ["kb_1"],
        topK: 8,
        similarityThreshold: 0.42,
      },
      tools: { enabled: ["docs.search"] },
      memory: { shortTerm: true, longTerm: false },
      systemPrompt: "Use approved sources.",
    });
  });

  it("rejects unsupported Gemini models", () => {
    expect(() =>
      parseLangGraphProviderConfig({
        model: { provider: "gemini", model: "gemini-pro" },
        ragflow: { baseUrl: "https://ragflow.example.com", datasetIds: [] },
      }),
    ).toThrow(`LangGraph provider model must be ${DEFAULT_GEMINI_MODEL}`);
  });

  it("rejects empty RAGFlow dataset lists", () => {
    expect(() =>
      parseLangGraphProviderConfig({
        model: { provider: "gemini", model: DEFAULT_GEMINI_MODEL },
        ragflow: { baseUrl: "https://ragflow.example.com", datasetIds: [] },
      }),
    ).toThrow("LangGraph provider config requires ragflow.datasetIds");
  });

  it("rejects secret-like keys anywhere in provider config", () => {
    expect(() =>
      parseLangGraphProviderConfig({
        model: { provider: "gemini", model: DEFAULT_GEMINI_MODEL },
        ragflow: {
          baseUrl: "https://ragflow.example.com",
          datasetIds: ["kb_1"],
          apiKey: "secret",
        },
      }),
    ).toThrow("LangGraph provider config must not contain secret-like key");
  });
});
