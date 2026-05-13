import { beforeEach, describe, expect, it, vi } from "vitest";
import { runProviderTest } from "../provider.js";

vi.mock("../../db.js", () => ({
  createPool: () => ({
    query: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  }),
  findWorkspace: vi.fn(),
}));

const { findWorkspace } = await import("../../db.js");
const mockFindWorkspace = vi.mocked(findWorkspace);

function createContext() {
  const output: string[] = [];
  return {
    context: {
      stdout: (message: string) => output.push(message),
      stderr: vi.fn(),
    },
    output,
  };
}

describe("provider test command", () => {
  beforeEach(() => {
    mockFindWorkspace.mockReset();
  });

  it("validates LangGraph config without calling the RAGFlow chat endpoint", async () => {
    const { context, output } = createContext();
    mockFindWorkspace.mockResolvedValue({
      provider_type: "langgraph",
      provider_config: {
        model: { provider: "gemini", model: "gemini-2.5-flash-lite" },
        ragflow: {
          baseUrl: "https://ragflow.example.com",
          datasetIds: ["kb_1"],
        },
      },
    } as any);

    await runProviderTest(context, "ws_langgraph");

    expect(output.join("")).toContain(
      "langgraph: model gemini/gemini-2.5-flash-lite configured",
    );
    expect(output.join("")).toContain(
      "langgraph: ragflow retrieval configured",
    );
  });
});
