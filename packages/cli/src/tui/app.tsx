import { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import {
  commandSpecs,
  type CommandField,
  type CommandSpec,
} from "../command-registry.js";
import type { CliContext } from "../context.js";

type Values = Record<string, string | boolean | undefined>;
type RunOutcome = "success" | "error";
type ListItem = { label: string; value: string };
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

export function TuiApp({
  commands = commandSpecs,
}: {
  commands?: CommandSpec[];
}) {
  const { exit } = useApp();
  const [selectedGroup, setSelectedGroup] = useState<FeatureGroup>();
  const [selected, setSelected] = useState<CommandSpec>();
  const [fieldIndex, setFieldIndex] = useState(0);
  const [values, setValues] = useState<Values>({});
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<RunOutcome>("success");
  const fields = selected ? [...selected.args, ...selected.options] : [];
  const field = fields[fieldIndex];

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

  if (running) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header title={selected.path.join(" ")} subtitle="Command running" />
        <Text color="yellow">Running...</Text>
        <Text>{output}</Text>
      </Box>
    );
  }

  if (completed) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header title={selected.path.join(" ")} subtitle="Command result" />
        <Text color={outcome === "success" ? "green" : "red"}>
          {outcome === "success" ? "Completed" : "Failed"}
        </Text>
        <Text>{output || "(No output)"}</Text>
        <ShortcutList
          items={[
            { label: "Run same command again", value: "again" },
            { label: "Run another command", value: "another" },
          ]}
          onSelect={(item) => {
            if (item.value === "again") {
              setCompleted(false);
              setOutput("");
              setOutcome("success");
              if (selected.destructive) {
                setFieldIndex(fields.length);
                return;
              }
              void runSelected(
                selected,
                values,
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
        <CommandSummary command={selected} values={values} />
        {selected.destructive ? (
          <>
            <Text color="red">This command changes or deletes data.</Text>
            <ShortcutList
              items={[
                { label: "Run command", value: "run" },
                ...(fields.length > 0
                  ? [{ label: "Edit inputs", value: "edit" }]
                  : []),
                { label: "Cancel", value: "cancel" },
              ]}
              onSelect={(item) => {
                if (item.value === "cancel") {
                  resetCommandState();
                  return;
                }
                if (item.value === "edit") {
                  setFieldIndex(0);
                  return;
                }
                void runSelected(
                  selected,
                  values,
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
              ...(fields.length > 0
                ? [{ label: "Edit inputs", value: "edit" }]
                : []),
              { label: "Back to command list", value: "back" },
            ]}
            onSelect={(item) => {
              if (item.value === "back") {
                resetCommandState();
                return;
              }
              if (item.value === "edit") {
                setFieldIndex(0);
                return;
              }
              void runSelected(
                selected,
                values,
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
        Field {fieldIndex + 1}/{fields.length}
      </Text>
      {error ? <Text color="red">{error}</Text> : null}
      <FieldPrompt
        field={field}
        value={values[field.name]}
        onChange={(value) => updateFieldValue(field, value)}
        onPreviousField={goToPreviousField}
        onNextField={goToNextField}
        onExit={resetCommandState}
        onReview={(value) => reviewInputs({ name: field.name, value })}
      />
    </Box>
  );

  function resetToMenu() {
    setSelectedGroup(undefined);
    setSelected(undefined);
    resetCommandState();
  }

  function resetCommandState() {
    setSelected(undefined);
    setFieldIndex(0);
    setValues({});
    setOutput("");
    setRunning(false);
    setCompleted(false);
    setError("");
    setOutcome("success");
  }

  function goToPreviousField() {
    if (fieldIndex === 0) return;
    setError("");
    setFieldIndex((current) => current - 1);
  }

  function goToNextField() {
    if (fieldIndex >= fields.length - 1) return;
    setError("");
    setFieldIndex((current) => current + 1);
  }

  function returnToInputsOrCommands() {
    if (fields.length > 0) {
      setFieldIndex(0);
      return;
    }
    resetCommandState();
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

    for (const [index, candidate] of fields.entries()) {
      const value = normalizeFieldValue(candidate, nextValues[candidate.name]);
      nextValues[candidate.name] = value;
      if (candidate.required && (value === "" || value === undefined)) {
        setValues(nextValues);
        setFieldIndex(index);
        setError(`${candidate.label} is required.`);
        return;
      }
    }

    setError("");
    setValues(nextValues);
    setFieldIndex(fields.length);
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

function CommandSummary({
  command,
  values,
}: {
  command: CommandSpec;
  values: Values;
}) {
  const fields = [...command.args, ...command.options];
  if (fields.length === 0) {
    return <Text color="gray">No inputs required.</Text>;
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="gray">Inputs</Text>
      {fields.map((field) => {
        const value = values[field.name];
        const renderedValue =
          value === undefined || value === "" ? "(not set)" : String(value);
        return (
          <Text key={field.name}>
            {field.label}: {field.secret ? "[hidden]" : renderedValue}
          </Text>
        );
      })}
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
  return String(value);
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

function normalizeFieldValue(
  field: CommandField,
  value: string | boolean | undefined,
) {
  if (value === "" || value === undefined) return field.defaultValue;
  return value;
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
