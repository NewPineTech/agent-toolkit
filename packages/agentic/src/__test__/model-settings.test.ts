import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENTIC_DEFAULTS } from "../constants.js";

interface ExpectedModelSettings {
  file: string;
  temperature: string;
  topP: string;
  maxTokens: string;
}

const expectedSettings: ExpectedModelSettings[] = [
  {
    file: "query-rewrite.ts",
    temperature: "0",
    topP: "null",
    maxTokens: "256",
  },
  {
    file: "router.ts",
    temperature: "0",
    topP: "null",
    maxTokens: "64",
  },
  {
    file: "graph.ts",
    temperature: "0",
    topP: "null",
    maxTokens: "96",
  },
  {
    file: "graph.ts",
    temperature: "0.2",
    topP: "0.85",
    maxTokens: "2048",
  },
  {
    file: "workflows/free-chat.ts",
    temperature: "0.4",
    topP: "0.9",
    maxTokens: "512",
  },
  {
    file: "workflows/hr-knowledge-qa.ts",
    temperature: "0.1",
    topP: "0.8",
    maxTokens: "1536",
  },
  {
    file: "workflows/hr-recruitment.ts",
    temperature: "0.1",
    topP: "0.8",
    maxTokens: "1536",
  },
];

describe("agentic node model settings", () => {
  it("centralizes the default Vertex model", () => {
    expect(AGENTIC_DEFAULTS.model.name).toBe("gemini-3.1-flash-lite");
  });

  it.each(expectedSettings)(
    "uses recommended generation settings in $file",
    async ({ file, temperature, topP, maxTokens }) => {
      const source = await readFile(resolve("src", file), "utf8");

      expect(source).toContain(`temperature: ${temperature}`);
      expect(source).toContain(`topP: ${topP}`);
      expect(source).toContain("presencePenalty: null");
      expect(source).toContain("frequencyPenalty: null");
      expect(source).toContain(`maxTokens: ${maxTokens}`);
    },
  );
});
