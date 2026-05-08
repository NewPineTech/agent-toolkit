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

export async function runIngestPipeline(
  context: CliContext,
  options: IngestOptions,
) {
  const limit = options.test ? "5" : undefined;
  const toolDir = resolveToolDir();
  const commands: string[][] = [
    buildIngestArgs(
      "inventory",
      { rootFolderId: options.rootFolderId },
      toolDir,
    ),
    buildIngestArgs("ocr-sop", { limit }, toolDir),
    buildIngestArgs("form-cards", { limit }, toolDir),
    buildIngestArgs("kb-create", { skipExisting: true }, toolDir),
    buildIngestArgs(
      "upload",
      { kb: "sop_kb", format: options.format ?? "md" },
      toolDir,
    ),
    buildIngestArgs(
      "upload",
      {
        kb: "forms_kb",
        format: options.format ?? "md",
      },
      toolDir,
    ),
  ];

  if (options.dryRun) {
    for (const command of commands) writeLine(context, command.join(" "));
    return;
  }

  ensureIngestEnvironment(toolDir);
  for (const command of commands) {
    await runProcess(context, command, toolDir);
  }
}

export async function runIngestCommand(
  context: CliContext,
  name: IngestName,
  options: IngestOptions,
) {
  const toolDir = resolveToolDir();
  const command = buildIngestArgs(name, options, toolDir);
  if (options.dryRun) {
    writeLine(context, command.join(" "));
    return;
  }
  ensureIngestEnvironment(toolDir);
  await runProcess(context, command, toolDir);
}

export async function runIngestSetup(context: CliContext) {
  const toolDir = resolveToolDir();
  const setupPython = resolveSetupPythonCommand();
  await runProcess(context, [setupPython, "-m", "venv", ".venv"], toolDir);
  const venvPython = getVenvPythonPath(toolDir);
  await runProcess(
    context,
    [venvPython, "-m", "pip", "install", "--upgrade", "pip"],
    toolDir,
  );
  await runProcess(
    context,
    [venvPython, "-m", "pip", "install", "-r", "requirements.txt"],
    toolDir,
  );
}

export function buildIngestArgs(
  name: IngestName,
  options: IngestOptions,
  toolDir = resolveToolDir(),
): string[] {
  const args = [getVenvPythonPath(toolDir), scriptFor(name)];
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

export function resolveToolDir(
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env["AGENT_TOOLKIT_INGEST_DIR"]?.trim();
  if (configured) return configured;
  const cwdToolDir = join(cwd, "tools", "ragflow_kb_generater");
  if (existsSync(cwdToolDir)) return cwdToolDir;
  if (existsSync(packageRelativeToolDir)) return packageRelativeToolDir;
  throw new Error(
    "RAGFlow ingest tools not found. Run this command from the repository root or set AGENT_TOOLKIT_INGEST_DIR.",
  );
}

export function getVenvPythonPath(toolDir: string): string {
  const executable =
    process.platform === "win32"
      ? join(".venv", "Scripts", "python.exe")
      : join(".venv", "bin", "python");
  return join(toolDir, executable);
}

export function resolveSetupPythonCommand(env = process.env): string {
  const configured = env["AGENT_TOOLKIT_PYTHON"]?.trim();
  if (configured) return configured;
  if (commandExists("python", env)) return "python";
  if (commandExists("python3", env)) return "python3";
  throw new Error(
    "Python interpreter not found. Install python3 or set AGENT_TOOLKIT_PYTHON.",
  );
}

function commandExists(command: string, env: NodeJS.ProcessEnv): boolean {
  const probe = spawnSync(command, ["--version"], { env, stdio: "ignore" });
  return probe.status === 0 && !probe.error;
}

function ensureIngestEnvironment(toolDir: string) {
  const venvPython = getVenvPythonPath(toolDir);
  if (!existsSync(venvPython)) {
    throw new Error(
      `RAGFlow ingest .venv is not ready at ${join(toolDir, ".venv")}. Run: agent-toolkit ingest setup`,
    );
  }

  const requirementsPath = join(toolDir, "requirements.txt");
  if (!existsSync(requirementsPath)) {
    throw new Error(
      `RAGFlow ingest requirements.txt not found at ${requirementsPath}.`,
    );
  }

  const check = spawnSync(
    venvPython,
    ["-c", REQUIREMENTS_CHECK_SCRIPT, requirementsPath],
    {
      cwd: toolDir,
      encoding: "utf8",
    },
  );
  if (check.status !== 0) {
    const detail = [check.stdout, check.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      `RAGFlow ingest Python requirements are missing or outdated. Run: agent-toolkit ingest setup${detail ? `\n${detail}` : ""}`,
    );
  }
}

const REQUIREMENTS_CHECK_SCRIPT = String.raw`
import sys
from importlib.metadata import PackageNotFoundError, version

try:
    from pip._vendor.packaging.requirements import Requirement
except Exception as exc:
    print(f"pip requirement parser unavailable: {exc}", file=sys.stderr)
    sys.exit(1)

missing = []
for raw_line in open(sys.argv[1], encoding="utf-8"):
    line = raw_line.split("#", 1)[0].strip()
    if not line or line.startswith(("-", "http:", "https:", "git+")):
        continue
    try:
        req = Requirement(line)
        installed = version(req.name)
    except PackageNotFoundError:
        missing.append(req.name)
        continue
    except Exception as exc:
        missing.append(f"{line} ({exc})")
        continue
    if req.specifier and not req.specifier.contains(installed, prereleases=True):
        missing.append(f"{req.name}{req.specifier} (installed {installed})")

if missing:
    print("Missing/outdated packages: " + ", ".join(missing), file=sys.stderr)
    sys.exit(1)
`;

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

function runProcess(
  context: CliContext,
  command: string[],
  cwd = process.env["AGENT_TOOLKIT_INGEST_DIR"] ?? resolveToolDir(),
): Promise<void> {
  return new Promise((resolve, reject) => {
    const [executable, ...args] = command;
    if (!executable) {
      reject(new Error("Missing executable"));
      return;
    }
    writeLine(context, `$ ${command.join(" ")}`);
    const child = spawn(executable, args, {
      cwd,
      stdio: ["inherit", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk: Buffer) =>
      context.stdout(chunk.toString("utf8")),
    );
    child.stderr.on("data", (chunk: Buffer) =>
      context.stderr(chunk.toString("utf8")),
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command.join(" ")} exited with code ${code}`));
    });
  });
}
