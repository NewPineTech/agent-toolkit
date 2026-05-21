import { access, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const promptNames = [
  "rewrite-query",
  "route-intent",
  "multi-intent-planner",
  "synthesize-final-answer",
  "summarize-conversation",
  "free-chat",
  "hr-knowledge-qa",
  "hr-recruitment",
] as const;

const packageRoot = join(import.meta.dirname, "..", "..");

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function buildAgenticPackage(): Promise<void> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  await execFileAsync(
    "pnpm",
    ["--filter", "@agent-toolkit/agentic", "run", "build"],
    {
      cwd: join(packageRoot, "../.."),
    },
  );
}

describe("prompt assets", () => {
  it("keeps required prompts as Markdown assets", async () => {
    await Promise.all(
      promptNames.map(async (promptName) => {
        const promptPath = join(
          packageRoot,
          "src",
          "prompts",
          `${promptName}.md`,
        );

        await expect(readFile(promptPath, "utf8")).resolves.toMatch(/\S/);
      }),
    );
  });

  it("loads prompts by name from source", async () => {
    const { loadPrompt } = (await import("../prompt-loader.js")) as {
      loadPrompt: (promptName: string) => Promise<string>;
    };

    await expect(loadPrompt("rewrite-query")).resolves.toContain("{{message}}");
  });

  it("keeps document, form, and procedure guidance in one HR knowledge prompt", async () => {
    const prompt = await readFile(
      join(packageRoot, "src", "prompts", "hr-knowledge-qa.md"),
      "utf8",
    );

    expect(prompt).toContain("This is one combined prompt");
    expect(prompt).toContain("Forms, templates, download links");
    expect(prompt).toContain("Procedures, SOP steps");
  });

  it("does not force a repeated final-answer opener", async () => {
    const prompt = await readFile(
      join(packageRoot, "src", "prompts", "synthesize-final-answer.md"),
      "utf8",
    );

    expect(prompt).not.toContain("Minh tom tat nhanh giup ban nhe");
    expect(prompt).toContain("Start directly with the answer");
  });

  it("does not force repeated final-answer follow-up invitations", async () => {
    const prompt = await readFile(
      join(packageRoot, "src", "prompts", "synthesize-final-answer.md"),
      "utf8",
    );

    expect(prompt).not.toContain("End with a short invitation");
    expect(prompt).not.toContain("neu ban can ho tro");
    expect(prompt).not.toContain("cu cho minh biet");
    expect(prompt).toContain("Follow-up invitations are optional");
    expect(prompt).toContain("Do not end every answer");
    expect(prompt).toContain("Avoid fixed closing phrases");
    expect(prompt).toContain("omit the follow-up invitation");
  });

  it("guards personal identity questions from assistant self-identification", async () => {
    const [routePrompt, freeChatPrompt, finalAnswerPrompt] = await Promise.all([
      readFile(join(packageRoot, "src", "prompts", "route-intent.md"), "utf8"),
      readFile(join(packageRoot, "src", "prompts", "free-chat.md"), "utf8"),
      readFile(
        join(packageRoot, "src", "prompts", "synthesize-final-answer.md"),
        "utf8",
      ),
    ]);
    const normalizedFreeChatPrompt = normalizeWhitespace(freeChatPrompt);

    expect(routePrompt).toContain(
      'User identity questions such as "tôi là ai"',
    );
    expect(freeChatPrompt).toContain("Personal Identity Questions");
    expect(freeChatPrompt).toContain("tôi là ai");
    expect(normalizedFreeChatPrompt).toContain(
      "treat it as a question about the user, not about the assistant",
    );
    expect(freeChatPrompt).toContain(
      "Do not answer with the assistant identity",
    );
    expect(finalAnswerPrompt).toContain("Personal Identity Questions");
    expect(finalAnswerPrompt).toContain(
      "Do not turn a user identity question into an assistant self-introduction",
    );
  });

  it("prevents progressive answers for process step-list questions", async () => {
    const [hrKnowledgePrompt, finalAnswerPrompt] = await Promise.all([
      readFile(
        join(packageRoot, "src", "prompts", "hr-knowledge-qa.md"),
        "utf8",
      ),
      readFile(
        join(packageRoot, "src", "prompts", "synthesize-final-answer.md"),
        "utf8",
      ),
    ]);
    const normalizedHrKnowledgePrompt = normalizeWhitespace(hrKnowledgePrompt);
    const normalizedFinalAnswerPrompt = normalizeWhitespace(finalAnswerPrompt);

    expect(hrKnowledgePrompt).toContain("Process Step List Rule");
    expect(hrKnowledgePrompt).toContain(
      "Never answer with only the first step",
    );
    expect(hrKnowledgePrompt).toContain("Forbidden for step-list questions");
    expect(hrKnowledgePrompt).toContain(
      "Allowed output shapes for process step-list questions",
    );
    expect(hrKnowledgePrompt).toContain("partial step item");
    expect(hrKnowledgePrompt).toContain("Bước đầu tiên là");
    expect(hrKnowledgePrompt).toContain("Do not ask whether the user wants");
    expect(normalizedHrKnowledgePrompt).toContain(
      "Do not duplicate the step number inside the item text",
    );
    expect(hrKnowledgePrompt).toContain("1. **Ten buoc:** mo ta");
    expect(hrKnowledgePrompt).toContain("1. **Bước 1:");
    expect(finalAnswerPrompt).toContain("Complete Step Lists");
    expect(finalAnswerPrompt).toContain("Do not shorten a complete step list");
    expect(finalAnswerPrompt).toContain(
      "Allowed final-answer shapes for process step-list questions",
    );
    expect(finalAnswerPrompt).toContain("Forbidden final-answer phrases");
    expect(finalAnswerPrompt).toContain("Do not replace it with a follow-up");
    expect(normalizedFinalAnswerPrompt).toContain(
      "Do not duplicate the step number inside the item text",
    );
    expect(finalAnswerPrompt).toContain("1. **Ten buoc:** mo ta");
    expect(finalAnswerPrompt).toContain("1. **Bước 1:");
  });

  it("copies prompts into dist during build", async () => {
    await rm(join(packageRoot, "dist"), { recursive: true, force: true });
    await buildAgenticPackage();

    await expect(
      access(join(packageRoot, "dist", "prompts", "rewrite-query.md")),
    ).resolves.toBeUndefined();
  });

  it("loads prompts from built dist output", async () => {
    await buildAgenticPackage();

    const distLoaderUrl = new URL(
      "../../dist/prompt-loader.js",
      import.meta.url,
    );
    const { loadPrompt } = (await import(distLoaderUrl.href)) as {
      loadPrompt: (promptName: "rewrite-query") => Promise<string>;
    };

    await expect(loadPrompt("rewrite-query")).resolves.toContain("{{message}}");
  });
});
