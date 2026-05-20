import { useEffect, useMemo, useState } from "react";
import { spawn } from "node:child_process";
import { Box, Text, useApp, useInput } from "ink";
import {
  commandSpecs,
  type CommandField,
  type CommandSpec,
} from "../command-registry.js";
import type { CliContext } from "../context.js";
import { createPool, listWorkspaceSummaries } from "../db.js";
import {
  resolveOperatorDefault,
  formatOperatorDefaultForReview,
  getLangGraphBaseUrlDefault,
  type OperatorDefaultName,
  type ResolvedOperatorDefault,
} from "../operator-defaults.js";
import { runGuidedWorkspaceCreate } from "../commands/workspace.js";
import {
  resolveCommandDefaults,
  type ResolvedCommandDefaults,
} from "./command-defaults.js";

type Values = Record<string, string | boolean | undefined>;
type RunOutcome = "success" | "error";
type ListItem = { label: string; value: string };
type AppMode = "operator-home" | "advanced-commands" | "setup-widget";
type CommandInputMode = "smart" | "details";
type SetupWidgetStep =
  | "workspace"
  | "embed"
  | "review"
  | "customize"
  | "createProvider"
  | "createReview";
type SetupEmbedType = "iframe" | "script" | "snippet" | "preview";
type SetupProviderType = "langgraph" | "ragflow";
type GuidedWorkspaceValues = {
  providerType?: string;
  agentId?: string;
  apiKey?: string;
  baseUrl?: string;
  domains?: string;
  authMode?: string;
  maxRequests?: string;
  windowMs?: string;
  maxMessageLength?: string;
};
export interface WorkspaceChoice {
  id: string;
  providerType: string;
  authMode: string;
  createdAt: string;
}
export type WorkspaceLoader = () => Promise<WorkspaceChoice[]>;
export type ClipboardWriter = (value: string) => Promise<void>;
export type OperatorDefaultResolver = (
  name: OperatorDefaultName,
) => ResolvedOperatorDefault;
export type GuidedWorkspaceCreator = (
  values: GuidedWorkspaceValues,
  context: CliContext,
) => Promise<string>;
type ClipboardCommandRunner = (
  command: string,
  args: string[],
  value: string,
) => Promise<void>;
type TerminalClipboardWriter = (value: string) => Promise<void>;
interface ClipboardOptions {
  platform?: NodeJS.Platform;
  runCommand?: ClipboardCommandRunner;
  writeTerminalClipboard?: TerminalClipboardWriter;
}
type FeatureGroup = {
  id: string;
  label: string;
  description: string;
  commands: CommandSpec[];
};

const groupDetails: Record<string, { label: string; description: string }> = {
  features: {
    label: "Features",
    description: "Review available and recommended CLI capabilities",
  },
  workspace: {
    label: "Workspace",
    description: "Manage customer workspaces, domains, auth, and limits",
  },
  widget: {
    label: "Widget",
    description: "Generate embeds, preview URLs, and validate widget access",
  },
  chat: {
    label: "Chat",
    description: "Smoke-test chat sessions and messages",
  },
  usage: {
    label: "Usage",
    description: "Inspect and export workspace usage metrics",
  },
  sessions: {
    label: "Sessions",
    description: "Inspect or expire active chat sessions",
  },
  ingest: {
    label: "Ingest",
    description: "Run RAGFlow knowledge-base ingest workflows",
  },
  validation: {
    label: "Validation",
    description: "Validate config, provider connectivity, and domains",
  },
};

const groupOrder = [
  "workspace",
  "widget",
  "chat",
  "usage",
  "sessions",
  "ingest",
  "validation",
  "features",
];

const setupCustomizationFields: CommandField[] = [
  { name: "title", label: "Widget title" },
  { name: "subtitle", label: "Widget subtitle" },
  { name: "placeholder", label: "Input placeholder" },
  { name: "greeting", label: "Greeting text" },
  { name: "suggestions", label: "Comma-separated suggestions" },
  { name: "primaryColor", label: "Primary theme color" },
  { name: "backgroundColor", label: "Background color" },
  { name: "textColor", label: "Text color" },
  {
    name: "position",
    label: "Widget position",
    type: "select",
    choices: ["bottom-right", "bottom-left"],
  },
  { name: "initialOpen", label: "Open panel on load", type: "boolean" },
];

export function TuiApp({
  commands = commandSpecs,
  loadWorkspaces = loadWorkspaceChoices,
  copyToClipboard = copyTextToClipboard,
  resolveDefault = (name) => resolveOperatorDefault(name),
  createWorkspace = (values, context) =>
    runGuidedWorkspaceCreate(context, values),
}: {
  commands?: CommandSpec[];
  loadWorkspaces?: WorkspaceLoader;
  copyToClipboard?: ClipboardWriter;
  resolveDefault?: OperatorDefaultResolver;
  createWorkspace?: GuidedWorkspaceCreator;
}) {
  const { exit } = useApp();
  const [mode, setMode] = useState<AppMode>(() =>
    commands === commandSpecs ? "operator-home" : "advanced-commands",
  );
  const [selectedGroup, setSelectedGroup] = useState<FeatureGroup>();
  const [selected, setSelected] = useState<CommandSpec>();
  const [commandInputMode, setCommandInputMode] =
    useState<CommandInputMode>("smart");
  const [confirmedPromptFirstFields, setConfirmedPromptFirstFields] = useState<
    string[]
  >([]);
  const [fieldIndex, setFieldIndex] = useState(0);
  const [values, setValues] = useState<Values>({});
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<RunOutcome>("success");
  const [workspaceChoices, setWorkspaceChoices] = useState<WorkspaceChoice[]>(
    [],
  );
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceLoadAttempt, setWorkspaceLoadAttempt] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");
  const [setupStep, setSetupStep] = useState<SetupWidgetStep>("workspace");
  const [setupWorkspace, setSetupWorkspace] = useState<WorkspaceChoice>();
  const [setupEmbedType, setSetupEmbedType] =
    useState<SetupEmbedType>("iframe");
  const [setupApiUrl, setSetupApiUrl] = useState("");
  const [setupApiUrlDraft, setSetupApiUrlDraft] = useState("");
  const [setupProviderType, setSetupProviderType] =
    useState<SetupProviderType>("langgraph");
  const [setupCreateError, setSetupCreateError] = useState("");
  const [setupCreateValues, setSetupCreateValues] = useState<Values>({});
  const [setupCreateFieldIndex, setSetupCreateFieldIndex] = useState(0);
  const [setupCustomizationValues, setSetupCustomizationValues] =
    useState<Values>({});
  const [setupCustomizationFieldIndex, setSetupCustomizationFieldIndex] =
    useState(0);
  const [setupOutputCopyable, setSetupOutputCopyable] = useState(false);
  const widgetApiUrlDefault = resolveDefault("WIDGET_API_URL");
  const langGraphApiKeyDefault = resolveDefault("LANGGRAPH_API_KEY");
  const langGraphPortDefault = resolveDefault("LANGGRAPH_PORT");
  const fields = selected ? [...selected.args, ...selected.options] : [];
  const resolvedInputs = selected
    ? resolveCommandDefaults(selected, {
        values,
        resolveOperatorDefault: resolveDefault,
      })
    : undefined;
  const promptFields = selected
    ? getPromptFields(
        selected,
        values,
        commandInputMode,
        resolvedInputs,
        confirmedPromptFirstFields,
      )
    : [];
  const field = promptFields[fieldIndex];
  const reviewValues = resolvedInputs?.values ?? values;
  const fieldValue = field
    ? (reviewValues[field.name] ?? values[field.name])
    : undefined;
  const selectedWorkspaceId =
    typeof values["workspaceId"] === "string" ? values["workspaceId"] : "";
  const needsWorkspaceSelection = selected
    ? commandRequiresWorkspaceSelection(selected)
    : false;
  const shouldSelectWorkspace =
    Boolean(selected) && needsWorkspaceSelection && selectedWorkspaceId === "";
  const canChangeWorkspace =
    needsWorkspaceSelection && selectedWorkspaceId !== "";
  const hasEditableInputs = fields.some((candidate) =>
    isEditableField(candidate, reviewValues),
  );

  const groups = useMemo(() => buildFeatureGroups(commands), [commands]);
  const groupItems = useMemo(
    () =>
      groups.map((group) => ({
        label: `${group.label} - ${group.description}`,
        value: group.id,
      })),
    [groups],
  );
  const commandItems = useMemo(
    () =>
      (selectedGroup?.commands ?? []).map((command) => ({
        label: `${formatCommandName(command)} - ${command.title}`,
        value: command.id,
      })),
    [selectedGroup],
  );

  useEffect(() => {
    const loadingForCommand =
      selected && needsWorkspaceSelection && selectedWorkspaceId === "";
    const loadingForSetup =
      mode === "setup-widget" && setupStep === "workspace" && !setupWorkspace;
    if (!loadingForCommand && !loadingForSetup) {
      return;
    }

    let cancelled = false;
    setLoadingWorkspaces(true);
    setWorkspaceError("");
    setWorkspaceChoices([]);
    loadWorkspaces()
      .then((choices) => {
        if (cancelled) return;
        setWorkspaceChoices(choices);
      })
      .catch((error) => {
        if (cancelled) return;
        setWorkspaceError(
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingWorkspaces(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    loadWorkspaces,
    mode,
    needsWorkspaceSelection,
    selected,
    selectedWorkspaceId,
    setupStep,
    setupWorkspace,
    workspaceLoadAttempt,
  ]);

  if (mode === "operator-home") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header title="Agent Toolkit" subtitle="Choose an operator task." />
        <ShortcutList
          items={[
            {
              label:
                "Setup widget - Select a workspace and generate embed code",
              value: "setup-widget",
            },
            {
              label: "Advanced commands - Browse every CLI command",
              value: "advanced",
            },
          ]}
          onSelect={(item) => {
            if (item.value === "setup-widget") {
              resetSetupState();
              setMode("setup-widget");
              return;
            }
            setMode("advanced-commands");
          }}
          onQuit={exit}
        />
      </Box>
    );
  }

  if (mode === "setup-widget") {
    if (running) {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Header title="Setup widget" subtitle="Generating widget output" />
          <Text color="yellow">Running...</Text>
          <Text>{sanitizeTerminalOutput(output)}</Text>
        </Box>
      );
    }

    if (completed) {
      const canCopyOutput =
        setupOutputCopyable && outcome === "success" && output.length > 0;
      return (
        <Box flexDirection="column" paddingX={1}>
          <Header title="Setup widget" subtitle="Widget output" />
          <Text color={outcome === "success" ? "green" : "red"}>
            {outcome === "success" ? "Completed" : "Failed"}
          </Text>
          <Text>{sanitizeTerminalOutput(output) || "(No output)"}</Text>
          {copyStatus ? (
            <Text
              color={copyStatus === "Copied to clipboard." ? "green" : "red"}
            >
              {sanitizeTerminalOutput(copyStatus)}
            </Text>
          ) : null}
          <ShortcutList
            items={[
              ...(canCopyOutput
                ? [{ label: "Copy output to clipboard", value: "copy" }]
                : []),
              { label: "Test widget access", value: "test" },
              { label: "Generate another format", value: "format" },
              { label: "Run another task", value: "home" },
            ]}
            onSelect={(item) => {
              if (item.value === "copy") {
                void copyOutput();
                return;
              }
              if (item.value === "format") {
                setCompleted(false);
                setOutput("");
                setCopyStatus("");
                setSetupStep("embed");
                return;
              }
              if (item.value === "test") {
                runSetupWidgetCommand("test");
                return;
              }
              resetToHome();
            }}
            onBack={() => {
              setCompleted(false);
              setOutput("");
              setCopyStatus("");
              setSetupStep("review");
            }}
            onQuit={exit}
          />
        </Box>
      );
    }

    if (setupStep === "workspace") {
      const workspaceItems = workspaceChoices.map((workspace) => ({
        label: `${renderTerminalText(workspace.id)} - ${renderTerminalText(workspace.providerType)} / ${renderTerminalText(workspace.authMode)} - ${renderTerminalText(workspace.createdAt)}`,
        value: workspace.id,
      }));

      return (
        <Box flexDirection="column" paddingX={1}>
          <Header title="Setup widget" subtitle="Select workspace" />
          {loadingWorkspaces ? (
            <Text color="yellow">Loading workspaces...</Text>
          ) : workspaceError ? (
            <>
              <Text color="red">{sanitizeTerminalOutput(workspaceError)}</Text>
              <ShortcutList
                items={[
                  { label: "Retry loading workspaces", value: "retry" },
                  { label: "Back to operator tasks", value: "back" },
                ]}
                onSelect={(item) => {
                  if (item.value === "retry") {
                    setWorkspaceLoadAttempt((current) => current + 1);
                    return;
                  }
                  resetToHome();
                }}
                onBack={resetToHome}
                onQuit={exit}
              />
            </>
          ) : workspaceItems.length === 0 ? (
            <>
              <Text color="gray">No workspaces found.</Text>
              <ShortcutList
                items={[
                  { label: "Create new workspace", value: "create" },
                  { label: "Back to operator tasks", value: "back" },
                ]}
                onSelect={(item) => {
                  if (item.value === "back") {
                    resetToHome();
                    return;
                  }
                  setSetupStep("createProvider");
                }}
                onBack={resetToHome}
                onQuit={exit}
              />
            </>
          ) : (
            <ShortcutList
              items={[
                ...workspaceItems,
                { label: "Create new workspace", value: "__create" },
                { label: "Back to operator tasks", value: "__back" },
              ]}
              onSelect={(item) => {
                if (item.value === "__back") {
                  resetToHome();
                  return;
                }
                if (item.value === "__create") {
                  setSetupStep("createProvider");
                  return;
                }
                const workspace = workspaceChoices.find(
                  (candidate) => candidate.id === item.value,
                );
                if (!workspace) return;
                setSetupWorkspace(workspace);
                setSetupApiUrl(widgetApiUrlDefault.value ?? "");
                setSetupStep("embed");
              }}
              onBack={resetToHome}
              onQuit={exit}
            />
          )}
        </Box>
      );
    }

    if (setupStep === "createProvider") {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Header title="Setup widget" subtitle="Choose provider type" />
          <ShortcutList
            items={[
              {
                label: "langgraph - First-party Agentic runtime",
                value: "langgraph",
              },
              { label: "ragflow - RAGFlow agent workspace", value: "ragflow" },
            ]}
            onSelect={(item) => {
              setSetupProviderType(item.value as SetupProviderType);
              setSetupCreateError("");
              setSetupCreateValues({});
              setSetupCreateFieldIndex(0);
              setSetupStep("createReview");
            }}
            onBack={() => setSetupStep("workspace")}
            onQuit={exit}
          />
        </Box>
      );
    }

    if (setupStep === "createReview") {
      const langGraphBaseUrl = getLangGraphBaseUrlDefault({
        port: langGraphPortDefault,
      });
      const ragflowFields: CommandField[] = [
        { name: "baseUrl", label: "Provider base URL", required: true },
        { name: "agentId", label: "Provider agent ID", required: true },
        {
          name: "apiKey",
          label: "Provider API key",
          required: true,
          secret: true,
          type: "password",
        },
      ];
      const ragflowField = ragflowFields[setupCreateFieldIndex];
      const ragflowValuesComplete = ragflowFields.every((field) => {
        const value = setupCreateValues[field.name];
        return typeof value === "string" && value.trim().length > 0;
      });
      const langGraphValues: GuidedWorkspaceValues = {
        providerType: "langgraph",
        agentId: "hr_assistant",
        apiKey: langGraphApiKeyDefault.value,
        baseUrl: langGraphBaseUrl.value,
        domains: "*",
        authMode: "anonymous",
        maxRequests: "30",
        windowMs: "60000",
        maxMessageLength: "4000",
      };
      const missingLangGraphKey =
        setupProviderType === "langgraph" && !langGraphApiKeyDefault.value;

      return (
        <Box flexDirection="column" paddingX={1}>
          <Header title="Setup widget" subtitle="Review workspace creation" />
          {setupCreateError ? (
            <Text color="red">{sanitizeTerminalOutput(setupCreateError)}</Text>
          ) : null}
          {setupProviderType === "langgraph" ? (
            <Box flexDirection="column" marginY={1}>
              <Text>Workspace ID: auto-generated ws_${"{number}"}</Text>
              <Text>Provider: langgraph</Text>
              <Text>
                Base URL: {renderTerminalText(langGraphBaseUrl.value)}
              </Text>
              <Text>Agent ID: hr_assistant</Text>
              <Text>
                {formatOperatorDefaultForReview(langGraphApiKeyDefault)}
              </Text>
              <Text>Allowed domains: *</Text>
              <Text>Auth mode: anonymous</Text>
            </Box>
          ) : (
            <Box flexDirection="column" marginY={1}>
              <Text>Workspace ID: auto-generated ws_${"{number}"}</Text>
              <Text>Provider: ragflow</Text>
              {ragflowValuesComplete ? (
                <>
                  <Text>
                    Base URL:{" "}
                    {renderTerminalText(String(setupCreateValues.baseUrl))}
                  </Text>
                  <Text>
                    Agent ID:{" "}
                    {renderTerminalText(String(setupCreateValues.agentId))}
                  </Text>
                  <Text>Provider API key: [hidden]</Text>
                  <Text>Allowed domains: *</Text>
                  <Text>Auth mode: anonymous</Text>
                </>
              ) : null}
            </Box>
          )}
          {setupProviderType === "ragflow" &&
          !ragflowValuesComplete &&
          ragflowField ? (
            <FieldPrompt
              field={ragflowField}
              value={setupCreateValues[ragflowField.name]}
              onChange={(value) =>
                setSetupCreateValues((current) => ({
                  ...current,
                  [ragflowField.name]: value,
                }))
              }
              onPreviousField={() =>
                setSetupCreateFieldIndex((current) => Math.max(0, current - 1))
              }
              onNextField={() =>
                setSetupCreateFieldIndex((current) =>
                  Math.min(ragflowFields.length - 1, current + 1),
                )
              }
              onExit={() => setSetupStep("createProvider")}
              onReview={(value) => {
                const nextValues = {
                  ...setupCreateValues,
                  [ragflowField.name]: value,
                };
                setSetupCreateValues(nextValues);
                const nextMissingIndex = ragflowFields.findIndex((field) => {
                  const nextValue = nextValues[field.name];
                  return (
                    typeof nextValue !== "string" ||
                    nextValue.trim().length === 0
                  );
                });
                if (nextMissingIndex !== -1) {
                  setSetupCreateFieldIndex(nextMissingIndex);
                }
              }}
            />
          ) : missingLangGraphKey ? (
            <>
              <Text color="red">
                LANGGRAPH_API_KEY is missing. Add it to .env.prod or .env, then
                retry.
              </Text>
              <ShortcutList
                items={[
                  { label: "Change provider type", value: "provider" },
                  { label: "Back to workspace list", value: "workspace" },
                ]}
                onSelect={(item) => {
                  if (item.value === "provider") {
                    setSetupStep("createProvider");
                    return;
                  }
                  setSetupStep("workspace");
                }}
                onBack={() => setSetupStep("createProvider")}
                onQuit={exit}
              />
            </>
          ) : (
            <ShortcutList
              items={[
                { label: "Create workspace", value: "create" },
                { label: "Change provider type", value: "provider" },
                { label: "Back to workspace list", value: "workspace" },
              ]}
              onSelect={(item) => {
                if (item.value === "provider") {
                  setSetupStep("createProvider");
                  return;
                }
                if (item.value === "workspace") {
                  setSetupStep("workspace");
                  return;
                }
                if (setupProviderType === "langgraph") {
                  void createSetupWorkspace(langGraphValues);
                  return;
                }
                void createSetupWorkspace({
                  providerType: "ragflow",
                  baseUrl: String(setupCreateValues.baseUrl),
                  agentId: String(setupCreateValues.agentId),
                  apiKey: String(setupCreateValues.apiKey),
                  domains: "*",
                  authMode: "anonymous",
                  maxRequests: "30",
                  windowMs: "60000",
                  maxMessageLength: "4000",
                });
              }}
              onBack={() => setSetupStep("createProvider")}
              onQuit={exit}
            />
          )}
        </Box>
      );
    }

    if (setupStep === "embed") {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Header title="Setup widget" subtitle="Choose embed type" />
          <ShortcutList
            items={[
              { label: "iframe - Plain iframe tag", value: "iframe" },
              { label: "script - Script tag embed", value: "script" },
              {
                label: "snippet - Full iframe + resize snippet",
                value: "snippet",
              },
              { label: "preview - Preview URL", value: "preview" },
            ]}
            onSelect={(item) => {
              setSetupEmbedType(item.value as SetupEmbedType);
              setSetupStep("review");
            }}
            onBack={() => setSetupStep("workspace")}
            onQuit={exit}
          />
        </Box>
      );
    }

    if (setupStep === "customize") {
      const customizationField =
        setupCustomizationFields[setupCustomizationFieldIndex] ??
        setupCustomizationFields[0]!;
      return (
        <Box flexDirection="column" paddingX={1}>
          <Header title="Setup widget" subtitle="Customize appearance" />
          <Text color="gray">
            Field {setupCustomizationFieldIndex + 1}/
            {setupCustomizationFields.length}
          </Text>
          <CustomizationSummary values={setupCustomizationValues} />
          <FieldPrompt
            field={customizationField}
            value={setupCustomizationValues[customizationField.name]}
            onChange={(value) =>
              setSetupCustomizationValues((current) => ({
                ...current,
                [customizationField.name]: value,
              }))
            }
            onPreviousField={() =>
              setSetupCustomizationFieldIndex((current) =>
                Math.max(0, current - 1),
              )
            }
            onNextField={() =>
              setSetupCustomizationFieldIndex((current) =>
                Math.min(setupCustomizationFields.length - 1, current + 1),
              )
            }
            onExit={() => setSetupStep("review")}
            onReview={(value) => {
              setSetupCustomizationValues((current) => ({
                ...current,
                [customizationField.name]: value,
              }));
              if (
                setupCustomizationFieldIndex <
                setupCustomizationFields.length - 1
              ) {
                setSetupCustomizationFieldIndex((current) => current + 1);
                return;
              }
              setSetupStep("review");
            }}
          />
          <Text color="gray">Esc returns to review.</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" paddingX={1}>
        <Header title="Setup widget" subtitle="Review widget setup" />
        <Box flexDirection="column" marginY={1}>
          <Text>Workspace: {renderTerminalText(setupWorkspace?.id ?? "")}</Text>
          <Text>Embed type: {setupEmbedType}</Text>
          <Text>
            Widget API URL:{" "}
            {setupApiUrl ? renderTerminalText(setupApiUrl) : "(missing)"}
          </Text>
          <Text>Source: {widgetApiUrlDefault.source}</Text>
          <CustomizationSummary values={setupCustomizationValues} />
        </Box>
        {!setupApiUrl ? (
          <TextFieldPrompt
            field={{
              name: "apiUrl",
              label: "Public Agent Toolkit server URL",
              required: true,
            }}
            value={setupApiUrlDraft}
            onChange={setSetupApiUrlDraft}
            onPreviousField={() => undefined}
            onNextField={() => undefined}
            onExit={() => setSetupStep("embed")}
            onReview={(value) => {
              if (typeof value === "string" && value.trim()) {
                setSetupApiUrl(value.trim());
              }
            }}
          />
        ) : (
          <ShortcutList
            items={[
              { label: "Generate embed", value: "generate" },
              { label: "Change workspace", value: "workspace" },
              { label: "Change embed type", value: "embed" },
              { label: "Change API URL", value: "api" },
              { label: "Customize appearance", value: "customize" },
            ]}
            onSelect={(item) => {
              if (item.value === "workspace") {
                resetSetupState();
                return;
              }
              if (item.value === "embed") {
                setSetupStep("embed");
                return;
              }
              if (item.value === "api") {
                setSetupApiUrl("");
                setSetupApiUrlDraft(widgetApiUrlDefault.value ?? "");
                return;
              }
              if (item.value === "customize") {
                setSetupCustomizationFieldIndex(0);
                setSetupStep("customize");
                return;
              }
              runSetupWidgetCommand(setupEmbedType);
            }}
            onBack={() => setSetupStep("embed")}
            onQuit={exit}
          />
        )}
      </Box>
    );
  }

  if (!selectedGroup) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header
          title="Agent Toolkit"
          subtitle="Choose a feature area, then pick a command."
        />
        <ShortcutList
          items={groupItems}
          onSelect={(item) => {
            setSelectedGroup(groups.find((group) => group.id === item.value));
            resetCommandState();
          }}
          onBack={resetToHome}
          onQuit={exit}
        />
      </Box>
    );
  }

  if (!selected) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header
          title={selectedGroup.label}
          subtitle={`${selectedGroup.description} (${selectedGroup.commands.length} commands)`}
        />
        <ShortcutList
          items={[
            ...commandItems,
            { label: "Back to feature groups", value: "__back" },
          ]}
          onSelect={(item) => {
            if (item.value === "__back") {
              resetToMenu();
              return;
            }
            resetCommandState();
            setSelected(
              selectedGroup.commands.find(
                (command) => command.id === item.value,
              ),
            );
          }}
          onBack={resetToMenu}
          onQuit={exit}
        />
      </Box>
    );
  }

  if (shouldSelectWorkspace) {
    const workspaceItems = workspaceChoices.map((workspace) => ({
      label: `${renderTerminalText(workspace.id)} - ${renderTerminalText(workspace.providerType)} / ${renderTerminalText(workspace.authMode)} - ${renderTerminalText(workspace.createdAt)}`,
      value: workspace.id,
    }));

    return (
      <Box flexDirection="column" paddingX={1}>
        <Header title={selected.path.join(" ")} subtitle="Select workspace" />
        {loadingWorkspaces ? (
          <Text color="yellow">Loading workspaces...</Text>
        ) : workspaceError ? (
          <>
            <Text color="red">{sanitizeTerminalOutput(workspaceError)}</Text>
            <ShortcutList
              items={[
                { label: "Retry loading workspaces", value: "retry" },
                { label: "Back to command list", value: "back" },
              ]}
              onSelect={(item) => {
                if (item.value === "retry") {
                  setWorkspaceLoadAttempt((current) => current + 1);
                  return;
                }
                resetCommandState();
              }}
              onBack={resetCommandState}
              onQuit={exit}
            />
          </>
        ) : workspaceItems.length === 0 ? (
          <>
            <Text color="gray">No workspaces found.</Text>
            <ShortcutList
              items={[{ label: "Back to command list", value: "back" }]}
              onSelect={resetCommandState}
              onBack={resetCommandState}
              onQuit={exit}
            />
          </>
        ) : (
          <ShortcutList
            items={workspaceItems}
            onSelect={(item) => selectWorkspace(item.value)}
            onBack={resetCommandState}
            onQuit={exit}
          />
        )}
      </Box>
    );
  }

  if (running) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header title={selected.path.join(" ")} subtitle="Command running" />
        <Text color="yellow">Running...</Text>
        <Text>{sanitizeTerminalOutput(output)}</Text>
      </Box>
    );
  }

  if (completed) {
    const canCopyOutput =
      selected.copyableOutput && outcome === "success" && output.length > 0;
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header title={selected.path.join(" ")} subtitle="Command result" />
        <Text color={outcome === "success" ? "green" : "red"}>
          {outcome === "success" ? "Completed" : "Failed"}
        </Text>
        <Text>{sanitizeTerminalOutput(output) || "(No output)"}</Text>
        {copyStatus ? (
          <Text color={copyStatus === "Copied to clipboard." ? "green" : "red"}>
            {sanitizeTerminalOutput(copyStatus)}
          </Text>
        ) : null}
        <ShortcutList
          items={[
            ...(canCopyOutput
              ? [{ label: "Copy output to clipboard", value: "copy" }]
              : []),
            { label: "Run same command again", value: "again" },
            { label: "Run another command", value: "another" },
          ]}
          onSelect={(item) => {
            if (item.value === "copy") {
              void copyOutput();
              return;
            }
            if (item.value === "again") {
              setCompleted(false);
              setOutput("");
              setOutcome("success");
              setCopyStatus("");
              if (selected.destructive) {
                setFieldIndex(promptFields.length);
                return;
              }
              void runSelected(
                selected,
                reviewValues,
                setRunning,
                setOutput,
                setCompleted,
                setOutcome,
              );
              return;
            }
            resetToMenu();
          }}
          onBack={resetCommandState}
          onQuit={exit}
        />
      </Box>
    );
  }

  if (!field) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header title={selected.path.join(" ")} subtitle="Review inputs" />
        <CommandSummary reviewItems={resolvedInputs?.reviewItems ?? []} />
        {selected.destructive ? (
          <>
            <Text color="red">This command changes or deletes data.</Text>
            <ShortcutList
              items={[
                { label: "Run command", value: "run" },
                ...(canChangeWorkspace
                  ? [{ label: "Change workspace", value: "workspace" }]
                  : []),
                ...(hasEditableInputs
                  ? [{ label: "Edit details", value: "edit" }]
                  : []),
                { label: "Cancel", value: "cancel" },
              ]}
              onSelect={(item) => {
                if (item.value === "cancel") {
                  resetCommandState();
                  return;
                }
                if (item.value === "edit") {
                  enterDetailsMode();
                  return;
                }
                if (item.value === "workspace") {
                  changeWorkspace();
                  return;
                }
                void runSelected(
                  selected,
                  reviewValues,
                  setRunning,
                  setOutput,
                  setCompleted,
                  setOutcome,
                );
              }}
              onBack={returnToInputsOrCommands}
              onQuit={exit}
            />
          </>
        ) : (
          <ShortcutList
            items={[
              { label: "Run command", value: "run" },
              ...(canChangeWorkspace
                ? [{ label: "Change workspace", value: "workspace" }]
                : []),
              ...(hasEditableInputs
                ? [{ label: "Edit details", value: "edit" }]
                : []),
              { label: "Back to command list", value: "back" },
            ]}
            onSelect={(item) => {
              if (item.value === "back") {
                resetCommandState();
                return;
              }
              if (item.value === "edit") {
                enterDetailsMode();
                return;
              }
              if (item.value === "workspace") {
                changeWorkspace();
                return;
              }
              void runSelected(
                selected,
                reviewValues,
                setRunning,
                setOutput,
                setCompleted,
                setOutcome,
              );
            }}
            onBack={returnToInputsOrCommands}
            onQuit={exit}
          />
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header title={selected.path.join(" ")} subtitle={selected.title} />
      <Text color="gray">
        Field {fieldIndex + 1}/{promptFields.length}
      </Text>
      {error ? <Text color="red">{error}</Text> : null}
      <FieldPrompt
        field={field}
        value={fieldValue}
        onChange={(value) => updateFieldValue(field, value)}
        onPreviousField={goToPreviousField}
        onNextField={goToNextField}
        onExit={() => {
          if (commandInputMode === "details") {
            setFieldIndex(promptFields.length);
            return;
          }
          resetCommandState();
        }}
        onReview={(value) => reviewInputs({ name: field.name, value })}
      />
    </Box>
  );

  function resetToMenu() {
    setSelectedGroup(undefined);
    setSelected(undefined);
    resetCommandState();
  }

  function resetToHome() {
    setMode("operator-home");
    setSelectedGroup(undefined);
    setSelected(undefined);
    resetCommandState();
    resetSetupState();
  }

  function resetCommandState() {
    setSelected(undefined);
    setCommandInputMode("smart");
    setConfirmedPromptFirstFields([]);
    setFieldIndex(0);
    setValues({});
    setOutput("");
    setRunning(false);
    setCompleted(false);
    setError("");
    setOutcome("success");
    setCopyStatus("");
    setWorkspaceChoices([]);
    setLoadingWorkspaces(false);
    setWorkspaceError("");
  }

  function resetSetupState() {
    setSetupStep("workspace");
    setSetupWorkspace(undefined);
    setSetupEmbedType("iframe");
    setSetupApiUrl("");
    setSetupApiUrlDraft("");
    setSetupProviderType("langgraph");
    setSetupCreateError("");
    setSetupCreateValues({});
    setSetupCreateFieldIndex(0);
    setSetupCustomizationValues({});
    setSetupCustomizationFieldIndex(0);
    setWorkspaceChoices([]);
    setLoadingWorkspaces(false);
    setWorkspaceError("");
    setOutput("");
    setCompleted(false);
    setRunning(false);
    setOutcome("success");
    setCopyStatus("");
    setSetupOutputCopyable(false);
  }

  function runSetupWidgetCommand(type: SetupEmbedType | "test") {
    const commandId = type === "test" ? "widget.test" : `widget.${type}`;
    const command = commands.find((candidate) => candidate.id === commandId);
    if (!command || !setupWorkspace || !setupApiUrl) return;
    setOutput("");
    setCompleted(false);
    setCopyStatus("");
    setSetupOutputCopyable(type !== "test");
    void runSelected(
      command,
      {
        workspaceId: setupWorkspace.id,
        apiUrl: setupApiUrl,
        ...setupCustomizationValues,
      },
      setRunning,
      setOutput,
      setCompleted,
      setOutcome,
    );
  }

  async function createSetupWorkspace(values: GuidedWorkspaceValues) {
    setSetupCreateError("");
    const context: CliContext = {
      stdout: () => undefined,
      stderr: () => undefined,
    };
    try {
      const workspaceId = await createWorkspace(values, context);
      setSetupWorkspace({
        id: workspaceId,
        providerType: values.providerType ?? setupProviderType,
        authMode: values.authMode ?? "anonymous",
        createdAt: new Date().toISOString(),
      });
      setSetupApiUrl(widgetApiUrlDefault.value ?? "");
      setSetupStep("embed");
    } catch (error) {
      setSetupCreateError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  function goToPreviousField() {
    const nextIndex = findEditableFieldIndex(
      promptFields,
      fieldIndex,
      -1,
      values,
    );
    if (nextIndex === -1) return;
    setError("");
    setFieldIndex(nextIndex);
  }

  function goToNextField() {
    const nextIndex = findEditableFieldIndex(
      promptFields,
      fieldIndex,
      1,
      values,
    );
    if (nextIndex === -1) return;
    setError("");
    setFieldIndex(nextIndex);
  }

  function returnToInputsOrCommands() {
    if (returnToEditableInputs()) return;
    resetCommandState();
  }

  function returnToEditableInputs() {
    const nextIndex = findEditableFieldIndex(promptFields, -1, 1, values);
    if (nextIndex === -1) return false;
    setFieldIndex(nextIndex);
    return true;
  }

  function enterDetailsMode() {
    if (!selected) return;
    const detailFields = getPromptFields(
      selected,
      reviewValues,
      "details",
      resolvedInputs,
    );
    const nextIndex = findEditableFieldIndex(detailFields, -1, 1, reviewValues);
    if (nextIndex === -1) return;
    setCommandInputMode("details");
    setValues(reviewValues);
    setError("");
    setFieldIndex(nextIndex);
  }

  function selectWorkspace(workspaceId: string) {
    const nextValues = { ...values, workspaceId };
    setError("");
    setValues(nextValues);
    setCommandInputMode("smart");
    setConfirmedPromptFirstFields([]);
    const nextPromptFields = selected
      ? getPromptFields(
          selected,
          nextValues,
          "smart",
          resolveCommandDefaults(selected, {
            values: nextValues,
            resolveOperatorDefault: resolveDefault,
          }),
          [],
        )
      : [];
    const nextIndex = findEditableFieldIndex(
      nextPromptFields,
      -1,
      1,
      nextValues,
    );
    setFieldIndex(nextIndex === -1 ? nextPromptFields.length : nextIndex);
  }

  function changeWorkspace() {
    setError("");
    setFieldIndex(0);
    setCommandInputMode("smart");
    setConfirmedPromptFirstFields([]);
    setValues((current) => ({
      ...current,
      workspaceId: undefined,
    }));
  }

  async function copyOutput() {
    setCopyStatus("");
    try {
      await copyToClipboard(output);
      setCopyStatus("Copied to clipboard.");
    } catch (error) {
      setCopyStatus(
        `Copy failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  function updateFieldValue(
    currentField: CommandField,
    value: string | boolean | undefined,
  ) {
    setValues((current) => ({
      ...current,
      [currentField.name]: value,
    }));
  }

  function reviewInputs(currentDraft?: {
    name: string;
    value: string | boolean | undefined;
  }) {
    const nextValues: Values = { ...values };
    if (currentDraft) {
      nextValues[currentDraft.name] = currentDraft.value;
    }

    if (!selected) return;
    const currentField = currentDraft
      ? fields.find((candidate) => candidate.name === currentDraft.name)
      : undefined;
    const nextConfirmedPromptFirstFields =
      currentField?.promptFirst && currentDraft
        ? Array.from(
            new Set([...confirmedPromptFirstFields, currentDraft.name]),
          )
        : confirmedPromptFirstFields;
    const nextResolved = resolveCommandDefaults(selected, {
      values: nextValues,
      resolveOperatorDefault: resolveDefault,
    });
    const missingField = nextResolved.missingRequiredFields.find((candidate) =>
      isEditableField(candidate, nextResolved.values),
    );
    if (missingField) {
      const nextPromptFields = getPromptFields(
        selected,
        nextResolved.values,
        commandInputMode,
        nextResolved,
        nextConfirmedPromptFirstFields,
      );
      const nextIndex = nextPromptFields.findIndex(
        (candidate) => candidate.name === missingField.name,
      );
      setValues(nextValues);
      setConfirmedPromptFirstFields(nextConfirmedPromptFirstFields);
      setFieldIndex(nextIndex === -1 ? 0 : nextIndex);
      setError(`${missingField.label} is required.`);
      return;
    }

    setError("");
    setValues(nextValues);
    setConfirmedPromptFirstFields(nextConfirmedPromptFirstFields);
    setFieldIndex(promptFields.length);
  }
}

function ShortcutList({
  items,
  onSelect,
  onBack,
  onQuit,
}: {
  items: ListItem[];
  onSelect(item: ListItem): void;
  onBack?: () => void;
  onQuit?: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((current) => moveIndex(current, -1, items.length));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((current) => moveIndex(current, 1, items.length));
      return;
    }
    if (key.leftArrow && onBack) {
      onBack();
      return;
    }
    if (input === "q" && onQuit) {
      onQuit();
      return;
    }
    if (key.return || key.rightArrow) {
      const item = items[selectedIndex];
      if (item) onSelect(item);
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((item, index) => (
        <Text
          key={`${item.value}-${index}`}
          color={index === selectedIndex ? "cyan" : undefined}
        >
          {index === selectedIndex ? "❯" : " "} {index + 1}. {item.label}
        </Text>
      ))}
      <Text color="gray">
        ↑/↓ move • Enter/→ select
        {onBack ? " • ← back" : ""} • q quit
      </Text>
    </Box>
  );
}

function moveIndex(current: number, delta: number, itemCount: number) {
  if (itemCount <= 0) return 0;
  return (current + delta + itemCount) % itemCount;
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        {title}
      </Text>
      <Text color="gray">{subtitle}</Text>
    </Box>
  );
}

function buildFeatureGroups(commands: CommandSpec[]): FeatureGroup[] {
  const groups = new Map<string, CommandSpec[]>();
  for (const command of commands) {
    const entries = groups.get(command.group) ?? [];
    entries.push(command);
    groups.set(command.group, entries);
  }

  return Array.from(groups, ([id, entries]) => {
    const detail = groupDetails[id] ?? {
      label: titleCase(id),
      description: `${entries.length} commands`,
    };
    return {
      id,
      label: detail.label,
      description: detail.description,
      commands: entries,
    };
  }).sort((left, right) => groupRank(left.id) - groupRank(right.id));
}

function formatCommandName(command: CommandSpec): string {
  return command.path.slice(1).join(" ") || command.path.join(" ");
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function groupRank(groupId: string): number {
  const index = groupOrder.indexOf(groupId);
  return index === -1 ? groupOrder.length : index;
}

async function loadWorkspaceChoices(): Promise<WorkspaceChoice[]> {
  const pool = createPool();
  try {
    const rows = await listWorkspaceSummaries(pool);
    return rows.map((row) => ({
      id: row.id,
      providerType: row.provider_type,
      authMode: row.auth_mode,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  } finally {
    await pool.end();
  }
}

export async function copyTextToClipboard(
  value: string,
  options: ClipboardOptions = {},
): Promise<void> {
  const platform = options.platform ?? process.platform;
  const runCommand = options.runCommand ?? writeClipboardCommand;
  const writeTerminalClipboard =
    options.writeTerminalClipboard ?? writeOsc52Clipboard;
  let lastError: unknown;

  if (platform === "darwin") {
    try {
      await runCommand("pbcopy", [], value);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  if (platform === "win32") {
    try {
      await runCommand("clip", [], value);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  if (platform !== "darwin" && platform !== "win32") {
    const commands: Array<[string, string[]]> = [
      ["wl-copy", []],
      ["xclip", ["-selection", "clipboard"]],
      ["xsel", ["--clipboard", "--input"]],
    ];
    for (const [command, args] of commands) {
      try {
        await runCommand(command, args, value);
        return;
      } catch (error) {
        lastError = error;
      }
    }
  }

  try {
    await writeTerminalClipboard(value);
  } catch (error) {
    const commandReason =
      lastError instanceof Error ? `: ${lastError.message}` : "";
    const terminalReason = error instanceof Error ? `; ${error.message}` : "";
    throw new Error(
      `No clipboard command or terminal clipboard fallback available${commandReason}${terminalReason}`,
    );
  }
}

function writeClipboardCommand(
  command: string,
  args: string[],
  value: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
    child.stdin.end(value);
  });
}

function writeOsc52Clipboard(value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const sequence = `\u001b]52;c;${Buffer.from(value, "utf8").toString("base64")}\u0007`;
    const flushed = process.stdout.write(sequence, (error) => {
      if (error) reject(error);
      else resolve();
    });
    if (!flushed) {
      process.stdout.once("error", reject);
    }
  });
}

function commandRequiresWorkspaceSelection(command: CommandSpec) {
  return [...command.args, ...command.options].some(isWorkspaceField);
}

function isWorkspaceField(field: CommandField) {
  return field.name === "workspaceId";
}

function isEditableField(field: CommandField, values: Values) {
  return !isWorkspaceField(field) || values["workspaceId"] === undefined;
}

function findEditableFieldIndex(
  fields: CommandField[],
  currentIndex: number,
  delta: 1 | -1,
  values: Values,
) {
  for (
    let index = currentIndex + delta;
    index >= 0 && index < fields.length;
    index += delta
  ) {
    const field = fields[index];
    if (field && isEditableField(field, values)) return index;
  }
  return -1;
}

function getPromptFields(
  command: CommandSpec,
  values: Values,
  mode: CommandInputMode,
  resolvedInputs: ResolvedCommandDefaults | undefined,
  confirmedPromptFirstFields: string[] = [],
) {
  const fields = [...command.args, ...command.options];
  if (mode === "details") {
    return fields.filter((field) => isEditableField(field, values));
  }

  const promptFirstFields = fields.filter(
    (field) =>
      field.promptFirst &&
      !confirmedPromptFirstFields.includes(field.name) &&
      isEditableField(field, values),
  );
  if (promptFirstFields.length > 0) return promptFirstFields;

  return (resolvedInputs?.missingRequiredFields ?? []).filter((field) =>
    isEditableField(field, resolvedInputs?.values ?? values),
  );
}

function CommandSummary({
  reviewItems,
}: {
  reviewItems: ResolvedCommandDefaults["reviewItems"];
}) {
  if (reviewItems.length === 0) {
    return <Text color="gray">No inputs required.</Text>;
  }
  const visibleItems = reviewItems.filter(
    (item) => !(item.advanced && item.missing),
  );

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="gray">Inputs</Text>
      {visibleItems.map((item) => {
        return (
          <Box key={item.name} flexDirection="column">
            <Text>
              {item.label}:{" "}
              {item.secret ? item.value : renderTerminalText(item.value)}
            </Text>
            {item.sourceLabel !== "missing" ? (
              <Text color="gray">Source: {item.sourceLabel}</Text>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}

function CustomizationSummary({ values }: { values: Values }) {
  const configuredFields = setupCustomizationFields.filter((field) => {
    const value = values[field.name];
    return value !== undefined && value !== "";
  });

  if (configuredFields.length === 0) {
    return <Text color="gray">Appearance: default</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text color="gray">Appearance</Text>
      {configuredFields.map((field) => (
        <Text key={field.name}>
          {field.label}: {renderTerminalText(String(values[field.name] ?? ""))}
        </Text>
      ))}
    </Box>
  );
}

function FieldPrompt({
  field,
  value,
  onChange,
  onPreviousField,
  onNextField,
  onExit,
  onReview,
}: {
  field: CommandField;
  value: string | boolean | undefined;
  onChange(value: string | boolean | undefined): void;
  onPreviousField(): void;
  onNextField(): void;
  onExit(): void;
  onReview(value: string | boolean | undefined): void;
}) {
  if (field.type === "boolean") {
    return (
      <ChoiceFieldPrompt
        field={field}
        value={value}
        choices={["false", "true"]}
        onChange={(nextValue) => onChange(nextValue === "true")}
        onPreviousField={onPreviousField}
        onNextField={onNextField}
        onExit={onExit}
        onReview={onReview}
      />
    );
  }

  if (field.type === "select" && field.choices) {
    return (
      <ChoiceFieldPrompt
        field={field}
        value={value}
        choices={field.choices}
        onChange={onChange}
        onPreviousField={onPreviousField}
        onNextField={onNextField}
        onExit={onExit}
        onReview={onReview}
      />
    );
  }

  return (
    <TextFieldPrompt
      field={field}
      value={typeof value === "string" ? value : ""}
      onChange={onChange}
      onPreviousField={onPreviousField}
      onNextField={onNextField}
      onExit={onExit}
      onReview={onReview}
    />
  );
}

function ChoiceFieldPrompt({
  field,
  value,
  choices,
  onChange,
  onPreviousField,
  onNextField,
  onExit,
  onReview,
}: {
  field: CommandField;
  value: string | boolean | undefined;
  choices: string[];
  onChange(value: string | boolean | undefined): void;
  onPreviousField(): void;
  onNextField(): void;
  onExit(): void;
  onReview(value: string | boolean | undefined): void;
}) {
  const renderedValue = renderFieldValue(field, value);

  useInput((input, key) => {
    if (key.escape) {
      onExit();
      return;
    }
    if (key.upArrow) {
      onPreviousField();
      return;
    }
    if (key.downArrow) {
      onNextField();
      return;
    }
    if (key.leftArrow) {
      onChange(moveChoice(value, choices, -1));
      return;
    }
    if (key.rightArrow) {
      onChange(moveChoice(value, choices, 1));
      return;
    }
    if (key.return || input.includes("\r") || input.includes("\n")) {
      onReview(value);
    }
  });

  return (
    <Box flexDirection="column">
      <Text>
        {field.label}
        {field.defaultValue !== undefined
          ? ` (${String(field.defaultValue)})`
          : ""}
        :{" "}
        <Text color={value === undefined ? "gray" : undefined}>
          {renderedValue}
        </Text>
      </Text>
      <Text color="gray">
        ←/→ change value • ↑/↓ switch field • Enter review • Esc command list
      </Text>
    </Box>
  );
}

function TextFieldPrompt({
  field,
  value,
  onChange,
  onPreviousField,
  onNextField,
  onExit,
  onReview,
}: {
  field: CommandField;
  value: string;
  onChange(value: string): void;
  onPreviousField(): void;
  onNextField(): void;
  onExit(): void;
  onReview(value: string | boolean | undefined): void;
}) {
  useInput((input, key) => {
    if (input.includes("\r") || input.includes("\n")) {
      const nextValue = applyTextInput(
        value,
        input.split(/[\r\n]/, 1)[0] ?? "",
      );
      onChange(nextValue);
      onReview(nextValue);
      return;
    }
    if (key.escape) {
      onExit();
      return;
    }
    if (key.upArrow) {
      onPreviousField();
      return;
    }
    if (key.downArrow) {
      onNextField();
      return;
    }
    if (key.return) {
      onReview(value);
      return;
    }
    if (key.backspace || key.delete || input === "\u007f" || input === "\b") {
      onChange(value.slice(0, -1));
      return;
    }
    if (key.ctrl || key.meta || key.tab || key.leftArrow || key.rightArrow) {
      return;
    }
    if (input) {
      onChange(applyTextInput(value, input));
    }
  });

  const placeholder = field.required ? "required" : "optional";
  const renderedValue = renderFieldValue(field, value) || placeholder;

  return (
    <Box flexDirection="column">
      <Text>
        {field.label}
        {field.defaultValue !== undefined
          ? ` (${String(field.defaultValue)})`
          : ""}
        :{" "}
        <Text color={value.length > 0 ? undefined : "gray"}>
          {renderedValue}
        </Text>
      </Text>
      <Text color="gray">
        ↑/↓ switch field • Enter review • Esc command list
      </Text>
    </Box>
  );
}

function renderFieldValue(
  field: CommandField,
  value: string | boolean | undefined,
) {
  if (value === undefined || value === "") {
    return "";
  }
  if (field.secret) {
    return "*".repeat(String(value).length);
  }
  return renderTerminalText(String(value));
}

function renderTerminalText(value: string) {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
}

function sanitizeTerminalOutput(value: string) {
  return value.replace(
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g,
    "",
  );
}

function applyTextInput(value: string, input: string) {
  let nextValue = value;
  for (const character of input) {
    if (character === "\u007f" || character === "\b") {
      nextValue = nextValue.slice(0, -1);
      continue;
    }
    if (character >= " ") {
      nextValue += character;
    }
  }
  return nextValue;
}

function moveChoice(
  value: string | boolean | undefined,
  choices: string[],
  delta: number,
) {
  if (choices.length === 0) return value;
  const currentValue = value === undefined ? undefined : String(value);
  const currentIndex = currentValue
    ? choices.indexOf(currentValue)
    : delta > 0
      ? -1
      : 0;
  const nextIndex = moveIndex(currentIndex, delta, choices.length);
  return choices[nextIndex];
}

async function runSelected(
  command: CommandSpec,
  values: Values,
  setRunning: (running: boolean) => void,
  setOutput: (output: string) => void,
  setCompleted: (completed: boolean) => void,
  setOutcome: (outcome: RunOutcome) => void,
) {
  let buffer = "";
  const context: CliContext = {
    stdout: (message) => {
      buffer += message;
      setOutput(buffer);
    },
    stderr: (message) => {
      buffer += message;
      setOutput(buffer);
    },
  };

  setRunning(true);
  setOutcome("success");
  try {
    await command.runner(context, values);
  } catch (error) {
    buffer += error instanceof Error ? error.message : String(error);
    setOutput(buffer);
    setOutcome("error");
  } finally {
    setCompleted(true);
    setRunning(false);
  }
}
