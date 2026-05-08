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
  runWidgetIframe,
  runWidgetPreview,
  runWidgetScript,
  runWidgetSnippet,
  runWidgetTest,
} from "./commands/widget.js";
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
import type { CliContext } from "./context.js";

export type CommandFieldType = "text" | "password" | "boolean" | "select";
export type CommandValues = Record<string, string | boolean | undefined>;

export interface CommandField {
  name: string;
  label: string;
  type?: CommandFieldType;
  required?: boolean;
  secret?: boolean;
  defaultValue?: string | boolean;
  choices?: string[];
}

export interface CommandSpec {
  id: string;
  path: string[];
  group: string;
  title: string;
  description: string;
  args: CommandField[];
  options: CommandField[];
  destructive?: boolean;
  runner(context: CliContext, values: CommandValues): void | Promise<void>;
}

const workspaceId = field("workspaceId", "Workspace ID", { required: true });
const sessionId = field("sessionId", "Session ID", { required: true });
const apiUrl = field("apiUrl", "Public Agent Toolkit server URL", {
  required: true,
});
const origin = field("origin", "Origin header");
const dates = [
  field("from", "Start date YYYY-MM-DD"),
  field("to", "End date YYYY-MM-DD"),
];
const workspaceOptions = [
  field("agentId", "Provider agent ID", { required: true }),
  field("apiKey", "Provider API key", {
    type: "password",
    required: true,
    secret: true,
  }),
  field("baseUrl", "Provider base URL", { required: true }),
  field("providerType", "Provider type", { defaultValue: "ragflow" }),
  field("domains", "Comma-separated allowed origins"),
  field("authMode", "Auth mode", {
    type: "select",
    choices: ["anonymous", "authenticated", "both"],
    defaultValue: "anonymous",
  }),
  field("authSecret", "Customer HMAC secret", {
    type: "password",
    secret: true,
  }),
  field("maxRequests", "Rate-limit max requests", { defaultValue: "30" }),
  field("windowMs", "Rate-limit window in ms", { defaultValue: "60000" }),
  field("maxMessageLength", "Max chat message length", {
    defaultValue: "4000",
  }),
];
const workspaceUpdateOptions = workspaceOptions.map(
  ({ defaultValue: _defaultValue, ...item }) => ({
    ...item,
    required: false,
  }),
);
const embedOptions = [
  apiUrl,
  field("title", "Widget title"),
  field("subtitle", "Widget subtitle"),
  field("placeholder", "Input placeholder"),
  field("greeting", "Greeting text"),
  field("suggestions", "Comma-separated suggestions"),
  field("primaryColor", "Primary theme color"),
  field("backgroundColor", "Background color"),
  field("textColor", "Text color"),
  field("position", "Widget position", {
    type: "select",
    choices: ["bottom-right", "bottom-left"],
  }),
  field("initialOpen", "Open panel on load", { type: "boolean" }),
];

export const commandSpecs: CommandSpec[] = [
  spec(
    "features",
    ["features"],
    "features",
    "Show CLI features",
    [],
    [],
    (ctx) => runFeatures(ctx),
  ),
  spec(
    "workspace.create",
    ["workspace", "create"],
    "workspace",
    "Create or update a workspace",
    [field("id", "Workspace ID", { required: true })],
    workspaceOptions,
    (ctx, v) => runWorkspaceCreate(ctx, v),
  ),
  spec(
    "workspace.list",
    ["workspace", "list"],
    "workspace",
    "List workspaces",
    [],
    [],
    (ctx) => runWorkspaceList(ctx),
  ),
  spec(
    "workspace.get",
    ["workspace", "get"],
    "workspace",
    "Show a workspace",
    [workspaceId],
    [],
    (ctx, v) => runWorkspaceGet(ctx, String(v.workspaceId)),
  ),
  spec(
    "workspace.update",
    ["workspace", "update"],
    "workspace",
    "Update a workspace",
    [workspaceId],
    workspaceUpdateOptions,
    (ctx, v) => runWorkspaceUpdate(ctx, String(v.workspaceId), v),
  ),
  spec(
    "workspace.delete",
    ["workspace", "delete"],
    "workspace",
    "Delete a workspace",
    [workspaceId],
    [],
    (ctx, v) => runWorkspaceDelete(ctx, String(v.workspaceId)),
    true,
  ),
  spec(
    "workspace.rotate-api-key",
    ["workspace", "rotate-api-key"],
    "workspace",
    "Rotate workspace provider API key",
    [workspaceId],
    [
      field("apiKey", "New provider API key", {
        type: "password",
        required: true,
        secret: true,
      }),
    ],
    (ctx, v) => runWorkspaceRotateApiKey(ctx, String(v.workspaceId), v),
  ),
  spec(
    "workspace.set-domains",
    ["workspace", "set-domains"],
    "workspace",
    "Set allowed domains",
    [workspaceId],
    [field("domains", "Comma-separated allowed origins", { required: true })],
    (ctx, v) => runWorkspaceSetDomains(ctx, String(v.workspaceId), v),
  ),
  spec(
    "workspace.set-rate-limit",
    ["workspace", "set-rate-limit"],
    "workspace",
    "Set rate limit",
    [workspaceId],
    [
      field("maxRequests", "Max requests", { required: true }),
      field("windowMs", "Window in ms", { required: true }),
    ],
    (ctx, v) => runWorkspaceSetRateLimit(ctx, String(v.workspaceId), v),
  ),
  spec(
    "workspace.set-auth",
    ["workspace", "set-auth"],
    "workspace",
    "Set auth mode",
    [workspaceId],
    [
      field("authMode", "Auth mode", {
        type: "select",
        choices: ["anonymous", "authenticated", "both"],
        required: true,
      }),
      field("authSecret", "Customer HMAC secret", {
        type: "password",
        secret: true,
      }),
    ],
    (ctx, v) => runWorkspaceSetAuth(ctx, String(v.workspaceId), v),
  ),
  ...widgetSpecs(),
  spec(
    "chat.ask",
    ["chat", "ask"],
    "chat",
    "Ask a chat question",
    [workspaceId, field("message", "Message", { required: true })],
    [apiUrl, origin],
    (ctx, v) =>
      runChatAsk(
        ctx,
        String(v.workspaceId),
        String(v.message),
        requireApiUrl(v),
      ),
  ),
  spec(
    "chat.session.create",
    ["chat", "session", "create"],
    "chat",
    "Create a chat session",
    [workspaceId],
    [apiUrl, origin],
    (ctx, v) =>
      runChatSessionCreate(ctx, String(v.workspaceId), requireApiUrl(v)),
  ),
  spec(
    "usage.report",
    ["usage", "report"],
    "usage",
    "Show usage report",
    [workspaceId],
    dates,
    (ctx, v) => runUsageReport(ctx, String(v.workspaceId), v),
  ),
  spec(
    "usage.daily",
    ["usage", "daily"],
    "usage",
    "Show daily usage",
    [workspaceId],
    dates,
    (ctx, v) => runUsageDaily(ctx, String(v.workspaceId), v),
  ),
  spec(
    "usage.export",
    ["usage", "export"],
    "usage",
    "Export usage",
    [workspaceId],
    [
      ...dates,
      field("format", "Export format", {
        type: "select",
        choices: ["csv", "json"],
        defaultValue: "csv",
      }),
    ],
    (ctx, v) => runUsageExport(ctx, String(v.workspaceId), v),
  ),
  spec(
    "sessions.list",
    ["sessions", "list"],
    "sessions",
    "List sessions",
    [workspaceId],
    [field("active", "Only active sessions", { type: "boolean" })],
    (ctx, v) => runSessionsList(ctx, String(v.workspaceId), v),
  ),
  spec(
    "sessions.get",
    ["sessions", "get"],
    "sessions",
    "Show a session",
    [sessionId],
    [],
    (ctx, v) => runSessionGet(ctx, String(v.sessionId)),
  ),
  spec(
    "sessions.expire",
    ["sessions", "expire"],
    "sessions",
    "Expire a session",
    [sessionId],
    [],
    (ctx, v) => runSessionExpire(ctx, String(v.sessionId)),
    true,
  ),
  ...ingestSpecs(),
  spec(
    "config.validate",
    ["config", "validate"],
    "validation",
    "Validate local config",
    [],
    [],
    (ctx) => runConfigValidate(ctx),
  ),
  spec(
    "provider.test",
    ["provider", "test"],
    "validation",
    "Validate provider",
    [workspaceId],
    [],
    (ctx, v) => runProviderTest(ctx, String(v.workspaceId)),
  ),
  spec(
    "domain.test",
    ["domain", "test"],
    "validation",
    "Validate domain allowlist",
    [workspaceId],
    [field("origin", "Origin URL", { required: true })],
    (ctx, v) =>
      runDomainTest(ctx, String(v.workspaceId), { origin: String(v.origin) }),
  ),
];

function widgetSpecs() {
  return [
    widget(
      "widget.snippet",
      "snippet",
      "Print full iframe + resize snippet",
      (ctx, id, v) => runWidgetSnippet(ctx, id, requireApiUrl(v)),
    ),
    widget(
      "widget.iframe",
      "iframe",
      "Print a plain iframe tag",
      (ctx, id, v) => runWidgetIframe(ctx, id, requireApiUrl(v)),
    ),
    widget(
      "widget.script",
      "script",
      "Print a script-tag embed",
      (ctx, id, v) => runWidgetScript(ctx, id, requireApiUrl(v)),
    ),
    widget(
      "widget.preview",
      "preview",
      "Print the widget preview URL",
      (ctx, id, v) => runWidgetPreview(ctx, id, requireApiUrl(v)),
    ),
    spec(
      "widget.test",
      ["widget", "test"],
      "widget",
      "Validate widget embed",
      [workspaceId],
      [apiUrl, origin],
      (ctx, v) => runWidgetTest(ctx, String(v.workspaceId), requireApiUrl(v)),
    ),
  ];
}

function ingestSpecs() {
  const common = [
    field("config", "Config path"),
    field("dryRun", "Print command without running it", { type: "boolean" }),
  ];
  return [
    spec(
      "ingest.setup",
      ["ingest", "setup"],
      "ingest",
      "Set up ingest environment",
      [],
      [],
      (ctx) => runIngestSetup(ctx),
    ),
    spec(
      "ingest.run",
      ["ingest", "run"],
      "ingest",
      "Run full ingest pipeline",
      [],
      [
        field("test", "Use a limit of 5 records", { type: "boolean" }),
        field("rootFolderId", "Drive root folder ID"),
        field("format", "Upload format", {
          type: "select",
          choices: ["md", "pdf", "both"],
          defaultValue: "md",
        }),
        field("dryRun", "Print commands without running them", {
          type: "boolean",
        }),
      ],
      (ctx, v) => runIngestPipeline(ctx, v),
    ),
    ingest("ingest.inventory", "inventory", "inventory", [
      field("rootFolderId", "Drive root folder ID"),
      ...common,
    ]),
    ingest("ingest.ocr-sop", "ocr-sop", "ocr-sop", [
      field("limit", "Limit files"),
      field("resume", "Skip existing output", { type: "boolean" }),
      field("batchSize", "OCR concurrency"),
      ...common,
    ]),
    ingest("ingest.form-cards", "form-cards", "form-cards", [
      field("limit", "Limit files"),
      field("resume", "Skip existing output", { type: "boolean" }),
      ...common,
    ]),
    ingest("ingest.md-to-pdf", "md-to-pdf", "md-to-pdf", [
      field("kb", "KB name", { defaultValue: "all" }),
      field("limit", "Limit files"),
      field("resume", "Skip existing output", { type: "boolean" }),
      ...common,
    ]),
    ingest("ingest.kb.create", "kb create", "kb-create", [
      field("skipExisting", "Skip existing KBs", {
        type: "boolean",
        defaultValue: true,
      }),
      ...common,
    ]),
    ingest("ingest.upload", "upload", "upload", [
      field("kb", "KB name", { required: true }),
      field("format", "Upload format", {
        type: "select",
        choices: ["md", "pdf", "both"],
        defaultValue: "md",
      }),
      field("limit", "Limit files"),
      field("skipParse", "Upload only", { type: "boolean" }),
      ...common,
    ]),
    ingest("ingest.test", "test", "test", [
      field("kb", "KB name", { required: true }),
      field("verbose", "Print full chunk content", { type: "boolean" }),
      ...common,
    ]),
  ];
}

function widget(
  id: string,
  name: string,
  title: string,
  runner: (
    context: CliContext,
    workspaceId: string,
    values: CommandValues,
  ) => void,
) {
  return spec(
    id,
    ["widget", name],
    "widget",
    title,
    [workspaceId],
    embedOptions,
    (ctx, v) => runner(ctx, String(v.workspaceId), v),
  );
}

function ingest(
  id: string,
  pathName: string,
  commandName: Parameters<typeof runIngestCommand>[1],
  options: CommandField[],
) {
  return spec(
    id,
    ["ingest", ...pathName.split(" ")],
    "ingest",
    `Run ${pathName}`,
    [],
    options,
    (ctx, v) => runIngestCommand(ctx, commandName, v),
  );
}

function field(
  name: string,
  label: string,
  options: Partial<CommandField> = {},
): CommandField {
  return { name, label, ...options };
}

function requireApiUrl(
  values: CommandValues,
): CommandValues & { apiUrl: string } {
  return { ...values, apiUrl: String(values.apiUrl) };
}

function spec(
  id: string,
  path: string[],
  group: string,
  title: string,
  args: CommandField[],
  options: CommandField[],
  runner: CommandSpec["runner"],
  destructive = false,
): CommandSpec {
  return {
    id,
    path,
    group,
    title,
    description: title,
    args,
    options,
    runner,
    destructive,
  };
}
