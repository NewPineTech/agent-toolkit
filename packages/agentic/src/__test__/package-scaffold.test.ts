import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = join(import.meta.dirname, "..", "..");

describe("agentic package scaffold", () => {
  it("declares the LangGraph dependencies needed by future graph code", async () => {
    const packageJson = JSON.parse(
      await readFile(join(packageRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).toMatchObject({
      "@langchain/core": expect.any(String),
      "@langchain/google-vertexai": expect.any(String),
      "@langchain/langgraph-checkpoint": expect.any(String),
      "@langchain/langgraph-cli": expect.any(String),
      "@langchain/langgraph": expect.any(String),
      zod: expect.any(String),
    });
  });

  it("exports specialized HR retriever tools from the package entrypoint", async () => {
    const agentic = (await import("../index.js")) as Record<string, unknown>;

    expect(agentic.retrieveHrProcess).toEqual(expect.any(Function));
    expect(agentic.retrieveHrForms).toEqual(expect.any(Function));
    expect(agentic.retrieveHrFormAndProcess).toBeUndefined();
    expect(agentic.retrieveHrDocuments).toBeUndefined();
  });
});
