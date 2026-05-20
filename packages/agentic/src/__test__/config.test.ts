import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = join(import.meta.dirname, "..", "..");

describe("agentic package scaffold", () => {
  it("declares the required package scripts", async () => {
    const packageJson = JSON.parse(
      await readFile(join(packageRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(Object.keys(packageJson.scripts ?? {}).sort()).toEqual([
      "build",
      "dev",
      "dev:server",
      "test",
      "typecheck",
    ]);
    expect(packageJson.scripts?.["dev:server"]).toContain(
      "--env-file=../../.env",
    );
  });

  it("declares each LangGraph Studio graph export", async () => {
    const langgraphConfig = JSON.parse(
      await readFile(join(packageRoot, "langgraph.json"), "utf8"),
    ) as { graphs?: Record<string, string> };

    expect(langgraphConfig).toMatchObject({
      node_version: "22",
      dependencies: ["."],
      graphs: {
        hr_assistant: "./src/graph.ts:hrAssistantGraph",
        free_chat: "./src/workflows/free-chat.ts:freeChatGraph",
        hr_knowledge_qa:
          "./src/workflows/hr-knowledge-qa.ts:hrKnowledgeQaGraph",
        hr_recruitment: "./src/workflows/hr-recruitment.ts:hrRecruitmentGraph",
      },
      env: "../../.env",
    });
  });

  it("uses source graph exports for Docker Studio schema extraction", async () => {
    const langgraphConfig = JSON.parse(
      await readFile(join(packageRoot, "langgraph.docker.json"), "utf8"),
    ) as { graphs?: Record<string, string> };

    expect(langgraphConfig.graphs?.hr_assistant).toBe(
      "./src/graph.ts:hrAssistantGraph",
    );
  });
});
