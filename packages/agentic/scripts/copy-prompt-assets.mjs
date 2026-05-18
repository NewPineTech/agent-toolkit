import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(scriptDirectory, "..");
const sourcePromptsDirectory = join(packageRoot, "src", "prompts");
const distPromptsDirectory = join(packageRoot, "dist", "prompts");

await mkdir(distPromptsDirectory, { recursive: true });
await cp(sourcePromptsDirectory, distPromptsDirectory, {
  recursive: true,
  force: true,
});
