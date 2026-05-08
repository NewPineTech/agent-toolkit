import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliContext } from "../context.js";
import { writeLine } from "../context.js";

type IngestName =
  | "inventory"
  | "ocr-sop"
  | "form-cards"
  | "md-to-pdf"
  | "kb-create"
  | "upload"
  | "test";

interface IngestOptions {
  test?: boolean;
  dryRun?: boolean;
  format?: string;
  limit?: string;
  resume?: boolean;
  batchSize?: string;
  config?: string;
  rootFolderId?: string;
  kb?: string;
  skipExisting?: boolean;
  skipParse?: boolean;
  verbose?: boolean;
}

const packageRelativeToolDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../tools/ragflow_kb_generater",
);

export async function runIngestPipeline(context: CliContext, options: IngestOptions) {
  const limit = options.test ? "5" : undefined;
  const commands: string[][] = [
    buildIngestArgs("inventory", {}),
    buildIngestArgs("ocr-sop", { limit }),
    buildIngestArgs("form-cards", { limit }),
    buildIngestArgs("kb-create", { skipExisting: true }),
    buildIngestArgs("upload", { kb: "sop_kb", format: options.format ?? "md" }),
    buildIngestArgs("upload", { kb: "forms_kb", format: options.format ?? "md" }),
  ];

  if (options.dryRun) {
    for (const command of commands) writeLine(context, command.join(" "));
    return;
  }

  for (const command of commands) {
    await runProcess(context, command);
  }
}

export async function runIngestCommand(context: CliContext, name: IngestName, options: IngestOptions) {
  const command = buildIngestArgs(name, options);
  if (options.dryRun) {
    writeLine(context, command.join(" "));
    return;
  }
  await runProcess(context, command);
}

function buildIngestArgs(name: IngestName, options: IngestOptions): string[] {
  const args = [resolvePythonCommand(), scriptFor(name)];
  if (options.rootFolderId) args.push("--root-folder-id", options.rootFolderId);
  if (options.limit) args.push("--limit", options.limit);
  if (options.resume) args.push("--resume");
  if (options.batchSize) args.push("--batch-size", options.batchSize);
  if (options.config) args.push("--config", options.config);
  if (options.kb) args.push("--kb", options.kb);
  if (options.format) args.push("--format", options.format);
  if (options.skipExisting) args.push("--skip-existing");
  if (options.skipParse) args.push("--skip-parse");
  if (options.verbose) args.push("--verbose");
  return args;
}

export function resolveToolDir(cwd = process.cwd()): string {
  const cwdToolDir = join(cwd, "tools", "ragflow_kb_generater");
  if (existsSync(cwdToolDir)) return cwdToolDir;
  if (existsSync(packageRelativeToolDir)) return packageRelativeToolDir;
  throw new Error(
    "RAGFlow ingest tools not found. Run this command from the repository root or set AGENT_TOOLKIT_INGEST_DIR.",
  );
}

export function resolvePythonCommand(env = process.env): string {
  const configured = env["AGENT_TOOLKIT_PYTHON"]?.trim();
  if (configured) return configured;
  if (commandExists("python", env)) return "python";
  if (commandExists("python3", env)) return "python3";
  throw new Error(
    "Python interpreter not found. Install python3 or set AGENT_TOOLKIT_PYTHON.",
  );
}

function commandExists(
  command: string,
  env: NodeJS.ProcessEnv,
): boolean {
  const probe = spawnSync(command, ["--version"], { env, stdio: "ignore" });
  return probe.status === 0 && !probe.error;
}

function scriptFor(name: IngestName): string {
  switch (name) {
    case "inventory":
      return "scripts/step1_inventory.py";
    case "ocr-sop":
      return "scripts/step2_ocr_sop.py";
    case "form-cards":
      return "scripts/step3_form_cards.py";
    case "md-to-pdf":
      return "scripts/step3_5_md_to_pdf.py";
    case "kb-create":
      return "scripts/step4_create_kbs.py";
    case "upload":
      return "scripts/step5_upload_to_ragflow.py";
    case "test":
      return "scripts/step6_test_retrieval.py";
  }
}

function runProcess(context: CliContext, command: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const [executable, ...args] = command;
    if (!executable) {
      reject(new Error("Missing executable"));
      return;
    }
    writeLine(context, `$ ${command.join(" ")}`);
    const child = spawn(executable, args, {
      cwd: process.env["AGENT_TOOLKIT_INGEST_DIR"] ?? resolveToolDir(),
      stdio: ["inherit", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk: Buffer) => context.stdout(chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => context.stderr(chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command.join(" ")} exited with code ${code}`));
    });
  });
}
