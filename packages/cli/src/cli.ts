import { Command } from "commander";
import { loadCliEnvDefaults } from "./cli-env.js";
import { runChatAsk, runChatSessionCreate } from "./commands/chat.js";
import { runConfigValidate } from "./commands/config.js";
import { runDomainTest } from "./commands/domain.js";
import { runFeatures } from "./commands/features.js";
import {
  runIngestCommand,
  runIngestPipeline,
  runIngestSetup,
} from "./commands/ingest.js";
import { runProviderTest } from "./commands/provider.js";
import {
  runSessionExpire,
  runSessionGet,
  runSessionsList,
} from "./commands/sessions.js";
import {
  runUsageDaily,
  runUsageExport,
  runUsageReport,
} from "./commands/usage.js";
import {
  runWorkspaceCreate,
  runWorkspaceDelete,
  runWorkspaceGet,
  runWorkspaceList,
  runWorkspaceRotateApiKey,
  runWorkspaceSetAuth,
  runWorkspaceSetDomains,
  runWorkspaceSetRateLimit,
  runWorkspaceUpdate,
} from "./commands/workspace.js";
import {
  runWidgetIframe,
  runWidgetPreview,
  runWidgetScript,
  runWidgetSnippet,
  runWidgetTest,
} from "./commands/widget.js";
import type { CliContext } from "./context.js";
import { runTui } from "./tui/index.js";

export interface CliProgramOptions {
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  exitOverride?: (code: number) => never;
  runTui?: (context: CliContext) => void | Promise<void>;
}

export function createCliProgram(options: CliProgramOptions = {}): Command {
  loadCliEnvDefaults();

  const context: CliContext = {
    stdout: options.stdout ?? ((message) => process.stdout.write(message)),
    stderr: options.stderr ?? ((message) => process.stderr.write(message)),
  };

  const program = new Command();
  program
    .name("agent-toolkit")
    .alias("atk")
    .description(
      "End-user CLI for Agent Toolkit workspaces, widgets, chat, usage, sessions, and RAGFlow ingest.",
    )
    .showHelpAfterError()
    .configureOutput({
      writeOut: context.stdout,
      writeErr: context.stderr,
    });

  if (options.exitOverride) {
    program.exitOverride((error) => {
      options.exitOverride?.(error.exitCode);
    });
  }

  program
    .command("features")
    .description("Show current and recommended user-facing CLI features")
    .action(() => runFeatures(context));

  program
    .command("tui")
    .description("Open the full-screen interactive terminal UI")
    .action(() => options.runTui?.(context) ?? runTui());

  addWorkspaceCommands(program, context);
  addWidgetCommands(program, context);
  addChatCommands(program, context);
  addUsageCommands(program, context);
  addSessionCommands(program, context);
  addIngestCommands(program, context);
  addValidationCommands(program, context);

  return program;
}

function addWorkspaceCommands(program: Command, context: CliContext) {
  const workspace = program
    .command("workspace")
    .description("Manage customer workspaces");

  workspace
    .command("create")
    .description("Create or update a workspace")
    .requiredOption("--id <id>", "Workspace ID")
    .requiredOption("--agent-id <id>", "Provider agent ID")
    .requiredOption("--api-key <key>", "Provider API key")
    .requiredOption("--base-url <url>", "Provider base URL")
    .option("--provider-type <type>", "Provider type", "ragflow")
    .option("--domains <domains>", "Comma-separated allowed origins", "")
    .option(
      "--auth-mode <mode>",
      "anonymous | authenticated | both",
      "anonymous",
    )
    .option(
      "--auth-secret <secret>",
      "Customer HMAC secret for authenticated mode",
    )
    .option("--max-requests <n>", "Rate-limit max requests", "30")
    .option("--window-ms <ms>", "Rate-limit window in milliseconds", "60000")
    .option("--max-message-length <n>", "Max chat message length", "4000")
    .action((opts) => runWorkspaceCreate(context, opts));

  workspace
    .command("list")
    .description("List workspaces")
    .action(() => runWorkspaceList(context));
  workspace
    .command("get <workspaceId>")
    .description("Show a workspace")
    .action((id) => runWorkspaceGet(context, id));
  workspace
    .command("update <workspaceId>")
    .description("Update workspace provider, auth, domain, or limit fields")
    .option("--agent-id <id>", "Provider agent ID")
    .option("--api-key <key>", "Provider API key")
    .option("--base-url <url>", "Provider base URL")
    .option("--provider-type <type>", "Provider type")
    .option("--domains <domains>", "Comma-separated allowed origins")
    .option("--auth-mode <mode>", "anonymous | authenticated | both")
    .option(
      "--auth-secret <secret>",
      "Customer HMAC secret for authenticated mode",
    )
    .option("--max-requests <n>", "Rate-limit max requests")
    .option("--window-ms <ms>", "Rate-limit window in milliseconds")
    .option("--max-message-length <n>", "Max chat message length")
    .action((id, opts) => runWorkspaceUpdate(context, id, opts));
  workspace
    .command("delete <workspaceId>")
    .description("Delete a workspace")
    .action((id) => runWorkspaceDelete(context, id));
  workspace
    .command("rotate-api-key <workspaceId>")
    .requiredOption("--api-key <key>", "New provider API key")
    .action((id, opts) => runWorkspaceRotateApiKey(context, id, opts));
  workspace
    .command("set-domains <workspaceId>")
    .requiredOption("--domains <domains>", "Comma-separated allowed origins")
    .action((id, opts) => runWorkspaceSetDomains(context, id, opts));
  workspace
    .command("set-rate-limit <workspaceId>")
    .requiredOption("--max-requests <n>", "Max requests")
    .requiredOption("--window-ms <ms>", "Window in milliseconds")
    .action((id, opts) => runWorkspaceSetRateLimit(context, id, opts));
  workspace
    .command("set-auth <workspaceId>")
    .requiredOption("--auth-mode <mode>", "anonymous | authenticated | both")
    .option("--auth-secret <secret>", "Customer HMAC secret")
    .action((id, opts) => runWorkspaceSetAuth(context, id, opts));
}

function addWidgetCommands(program: Command, context: CliContext) {
  const widget = program
    .command("widget")
    .description("Generate and validate widget embeds");
  const addEmbedOptions = (command: Command) =>
    command
      .requiredOption("--api-url <url>", "Public Agent Toolkit server URL")
      .option("--title <title>", "Widget title")
      .option("--subtitle <text>", "Widget subtitle")
      .option("--placeholder <text>", "Input placeholder")
      .option("--greeting <text>", "Greeting text")
      .option("--suggestions <items>", "Comma-separated suggestions")
      .option("--primary-color <hex>", "Primary theme color")
      .option("--background-color <hex>", "Background color")
      .option("--text-color <hex>", "Text color")
      .option("--position <position>", "bottom-right | bottom-left")
      .option("--initial-open", "Open the panel on load");

  addEmbedOptions(
    widget
      .command("snippet <workspaceId>")
      .description("Print full iframe + resize snippet"),
  ).action((id, opts) => runWidgetSnippet(context, id, opts));
  addEmbedOptions(
    widget
      .command("iframe <workspaceId>")
      .description("Print a plain iframe tag"),
  ).action((id, opts) => runWidgetIframe(context, id, opts));
  addEmbedOptions(
    widget
      .command("script <workspaceId>")
      .description("Print a script-tag embed"),
  ).action((id, opts) => runWidgetScript(context, id, opts));
  addEmbedOptions(
    widget
      .command("preview <workspaceId>")
      .description("Print the widget preview URL"),
  ).action((id, opts) => runWidgetPreview(context, id, opts));
  widget
    .command("test <workspaceId>")
    .requiredOption("--api-url <url>", "Public Agent Toolkit server URL")
    .option("--origin <origin>", "Origin header to test")
    .action((id, opts) => runWidgetTest(context, id, opts));
}

function addChatCommands(program: Command, context: CliContext) {
  const chat = program.command("chat").description("Smoke-test workspace chat");
  chat
    .command("ask <workspaceId> <message>")
    .requiredOption("--api-url <url>", "Public Agent Toolkit server URL")
    .option("--origin <origin>", "Origin header")
    .action((id, message, opts) => runChatAsk(context, id, message, opts));
  chat
    .command("session")
    .description("Manage chat sessions")
    .command("create <workspaceId>")
    .requiredOption("--api-url <url>", "Public Agent Toolkit server URL")
    .option("--origin <origin>", "Origin header")
    .action((id, opts) => runChatSessionCreate(context, id, opts));
}

function addUsageCommands(program: Command, context: CliContext) {
  const usage = program.command("usage").description("Inspect workspace usage");
  usage
    .command("report <workspaceId>")
    .option("--from <date>", "Start date YYYY-MM-DD")
    .option("--to <date>", "End date YYYY-MM-DD")
    .action((id, opts) => runUsageReport(context, id, opts));
  usage
    .command("daily <workspaceId>")
    .option("--from <date>", "Start date YYYY-MM-DD")
    .option("--to <date>", "End date YYYY-MM-DD")
    .action((id, opts) => runUsageDaily(context, id, opts));
  usage
    .command("export <workspaceId>")
    .option("--from <date>", "Start date YYYY-MM-DD")
    .option("--to <date>", "End date YYYY-MM-DD")
    .option("--format <format>", "json | csv", "csv")
    .action((id, opts) => runUsageExport(context, id, opts));
}

function addSessionCommands(program: Command, context: CliContext) {
  const sessions = program
    .command("sessions")
    .description("Inspect and expire sessions");
  sessions
    .command("list <workspaceId>")
    .option("--active", "Only active sessions")
    .action((id, opts) => runSessionsList(context, id, opts));
  sessions
    .command("get <sessionId>")
    .action((id) => runSessionGet(context, id));
  sessions
    .command("expire <sessionId>")
    .action((id) => runSessionExpire(context, id));
}

function addIngestCommands(program: Command, context: CliContext) {
  const ingest = program
    .command("ingest")
    .description("Run RAGFlow knowledge-base ingest features");
  ingest
    .command("setup")
    .description("Create .venv and install RAGFlow ingest requirements")
    .action(() => runIngestSetup(context));
  ingest
    .command("run")
    .option("--test", "Use a limit of 5 records per expensive step")
    .option(
      "--root-folder-id <id>",
      "Override Drive root folder ID for inventory",
    )
    .option("--format <format>", "Upload format: md | pdf | both", "md")
    .option("--dry-run", "Print commands without running them")
    .action((opts) => runIngestPipeline(context, opts));
  ingest
    .command("inventory")
    .option("--root-folder-id <id>", "Override Drive root folder ID")
    .option("--config <path>", "Config path")
    .option("--dry-run", "Print command without running it")
    .action((opts) => runIngestCommand(context, "inventory", opts));
  ingest
    .command("ocr-sop")
    .option("--limit <n>", "Limit files")
    .option("--resume", "Skip existing output")
    .option("--batch-size <n>", "OCR concurrency")
    .option("--config <path>", "Config path")
    .option("--dry-run", "Print command without running it")
    .action((opts) => runIngestCommand(context, "ocr-sop", opts));
  ingest
    .command("form-cards")
    .option("--limit <n>", "Limit files")
    .option("--resume", "Skip existing output")
    .option("--config <path>", "Config path")
    .option("--dry-run", "Print command without running it")
    .action((opts) => runIngestCommand(context, "form-cards", opts));
  ingest
    .command("md-to-pdf")
    .option("--kb <name>", "forms_kb | sop_kb | all", "all")
    .option("--limit <n>", "Limit files")
    .option("--resume", "Skip existing output")
    .option("--config <path>", "Config path")
    .option("--dry-run", "Print command without running it")
    .action((opts) => runIngestCommand(context, "md-to-pdf", opts));
  const kb = ingest.command("kb").description("Manage RAGFlow knowledge bases");
  kb.command("create")
    .option("--skip-existing", "Skip existing KBs", true)
    .option("--config <path>", "Config path")
    .option("--dry-run", "Print command without running it")
    .action((opts) => runIngestCommand(context, "kb-create", opts));
  ingest
    .command("upload")
    .requiredOption("--kb <name>", "KB name")
    .option("--format <format>", "md | pdf | both", "md")
    .option("--limit <n>", "Limit files")
    .option("--skip-parse", "Upload only")
    .option("--config <path>", "Config path")
    .option("--dry-run", "Print command without running it")
    .action((opts) => runIngestCommand(context, "upload", opts));
  ingest
    .command("test")
    .requiredOption("--kb <name>", "KB name")
    .option("--verbose", "Print full chunk content")
    .option("--config <path>", "Config path")
    .option("--dry-run", "Print command without running it")
    .action((opts) => runIngestCommand(context, "test", opts));
}

function addValidationCommands(program: Command, context: CliContext) {
  program
    .command("config")
    .description("Validate local CLI/server configuration")
    .command("validate")
    .action(() => runConfigValidate(context));
  program
    .command("provider")
    .description("Validate provider connectivity")
    .command("test <workspaceId>")
    .action((id) => runProviderTest(context, id));
  program
    .command("domain")
    .description("Validate workspace domain allowlists")
    .command("test <workspaceId>")
    .requiredOption("--origin <origin>", "Origin URL")
    .action((id, opts) => runDomainTest(context, id, opts));
}
