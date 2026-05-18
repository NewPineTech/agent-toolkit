import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const PROMPT_NAMES = [
  "rewrite-query",
  "route-intent",
  "multi-intent-planner",
  "synthesize-final-answer",
  "summarize-conversation",
  "free-chat",
  "hr-knowledge-qa",
  "hr-recruitment",
] as const;

export type PromptName = (typeof PROMPT_NAMES)[number];

export async function loadPrompt(promptName: PromptName): Promise<string> {
  const promptPath = join(import.meta.dirname, "prompts", `${promptName}.md`);
  return readFile(promptPath, "utf8");
}
