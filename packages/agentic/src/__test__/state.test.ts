import { describe, expect, it } from "vitest";

describe("agentic state contract", () => {
  it("creates the default state shape used by all tracks", async () => {
    const { createInitialAgenticState } = (await import("../state.js")) as {
      createInitialAgenticState: (message: string) => unknown;
    };

    expect(createInitialAgenticState("Xin chao")).toEqual({
      message: "Xin chao",
      messages: [],
      memorySummary: undefined,
      messagesSinceSummary: 0,
      summaryBufferMessages: [],
      standaloneQuery: undefined,
      selectedIntents: [],
      workflowResults: [],
      finalAnswer: undefined,
      warnings: [],
    });
  });

  it("declares a minimal Studio input schema with a usable default message", async () => {
    const { AgenticInputSchema, AgenticStudioDefaultInput } =
      (await import("../state.js")) as typeof import("../state.js");

    expect(AgenticInputSchema.parse({})).toEqual({
      message: AgenticStudioDefaultInput,
    });
  });
});

describe("agentic constants", () => {
  it("keeps non-secret defaults in source constants", async () => {
    const constants = (await import("../constants.js")) as {
      AGENTIC_DEFAULTS: {
        model: {
          provider: string;
          name: string;
          temperature: number;
        };
        retriever: {
          ragflowBaseUrl: string;
          recruitmentDatasetId: string;
        };
        memory: {
          messageWindowSize: number;
          summaryTriggerMessages: number;
        };
      };
    };

    expect(constants.AGENTIC_DEFAULTS).toMatchObject({
      model: {
        provider: "google_vertexai",
        name: expect.any(String),
        temperature: expect.any(Number),
      },
      retriever: {
        ragflowBaseUrl: expect.stringMatching(/^https?:\/\//),
        recruitmentDatasetId: expect.any(String),
      },
      memory: {
        messageWindowSize: 6,
        summaryTriggerMessages: 6,
      },
    });
  });

  it("keeps document search defaults out of specialized retriever profiles", async () => {
    const constants = (await import("../constants.js")) as {
      AGENTIC_RETRIEVER_PROFILES: Record<
        string,
        {
          datasetIds: readonly string[];
          topK: number;
          pageSize: number;
          minimumScore: number;
          keywordSimilarityWeight: number;
        }
      >;
    };

    expect(Object.keys(constants.AGENTIC_RETRIEVER_PROFILES).sort()).toEqual([
      "formOnly",
      "processOnly",
    ]);
    expect(constants.AGENTIC_RETRIEVER_PROFILES).not.toHaveProperty(
      "documentSearch",
    );
    expect(constants.AGENTIC_RETRIEVER_PROFILES).not.toHaveProperty(
      "formAndProcess",
    );
    expect(constants.AGENTIC_RETRIEVER_PROFILES).toHaveProperty("processOnly");
    expect(constants.AGENTIC_RETRIEVER_PROFILES).toHaveProperty("formOnly");
  });
});
