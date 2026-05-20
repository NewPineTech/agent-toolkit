import type {
  AdminAgenticCapabilityCatalogEntry,
  AdminAgenticRunDetail,
  AdminAgenticRunStatus,
  AdminAgenticRunSummary,
} from "@agent-toolkit/types";
import {
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  Clock3,
  Copy,
  FileSearch,
  GitBranch,
  RefreshCw,
  Search,
  ShieldAlert,
  Wrench,
  XCircle,
} from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import type { AgenticInspectorFilters } from "./agentic-inspector-client.js";

export type EvidenceInspectorViewState = "ready" | "loading" | "error";

export interface EvidenceInspectorProps {
  runs: AdminAgenticRunSummary[];
  selectedRun?: AdminAgenticRunDetail;
  capabilities?: AdminAgenticCapabilityCatalogEntry[];
  state?: EvidenceInspectorViewState;
  errorMessage?: string;
  stale?: boolean;
  filters?: AgenticInspectorFilters;
  onFiltersChange?: (filters: AgenticInspectorFilters) => void;
  onRefresh?: () => void;
  onRunSelect?: (runId: string) => void;
}

const statusIcons = {
  success: CheckCircle2,
  warning: AlertTriangle,
  blocked: ShieldAlert,
  failed: XCircle,
  running: Clock3,
} as const;

const statusLabels: Record<AdminAgenticRunSummary["status"], string> = {
  success: "success",
  warning: "warning",
  blocked: "blocked",
  failed: "failed",
  running: "running",
};

const tabs = [
  "State",
  "Tool Calls",
  "Sources",
  "Missing Evidence",
  "Confidence",
  "JSON",
] as const;

type DetailTab = (typeof tabs)[number];

export function EvidenceInspector({
  runs,
  selectedRun,
  capabilities = [],
  state = "ready",
  errorMessage,
  stale = false,
  filters = {},
  onFiltersChange,
  onRefresh,
  onRunSelect,
}: EvidenceInspectorProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("State");
  const [graphVisible, setGraphVisible] = useState(true);
  const [stateExpanded, setStateExpanded] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const selectedSummary = selectedRun?.summary ?? runs[0];
  const groupedCapabilities = groupCapabilities(capabilities);
  const rawJsonText = useMemo(
    () => JSON.stringify(selectedRun?.rawJson.value ?? {}, null, 2),
    [selectedRun],
  );

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(rawJsonText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <section style={styles.shell} aria-label="Agentic evidence inspector">
      <header role="banner" style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Admin evidence inspector</p>
          <h1 style={styles.title}>Agentic Runs</h1>
        </div>
        <div style={styles.headerStats}>
          <button
            aria-label="Refresh agentic runs"
            onClick={onRefresh}
            style={styles.iconButton}
            type="button"
          >
            <RefreshCw aria-hidden size={16} />
          </button>
          <Metric label="Runs" value={runs.length.toString()} />
          <Metric
            label="Warnings"
            value={runs
              .reduce((total, run) => total + run.warningCount, 0)
              .toString()}
          />
          <Metric
            label="Blocked"
            value={runs
              .filter((run) => run.status === "blocked")
              .length.toString()}
          />
        </div>
      </header>

      <div style={styles.filterBar}>
        <label style={styles.searchLabel}>
          <Search aria-hidden size={16} />
          <input
            aria-label="Search runs"
            placeholder="Search run, thread, evidence"
            value={filters.threadId ?? ""}
            onChange={(event) =>
              onFiltersChange?.({
                ...filters,
                threadId: event.currentTarget.value || undefined,
                offset: 0,
              })
            }
            style={styles.searchInput}
          />
        </label>
        <select
          aria-label="Workspace filter"
          style={styles.filterSelect}
          value={filters.workspaceId ?? "all"}
          onChange={(event) =>
            onFiltersChange?.({
              ...filters,
              workspaceId:
                event.currentTarget.value === "all"
                  ? undefined
                  : event.currentTarget.value,
              offset: 0,
            })
          }
        >
          <option value="all">All workspaces</option>
          {uniqueValues(runs.map((run) => run.workspaceId)).map(
            (workspaceId) => (
              <option key={workspaceId} value={workspaceId}>
                {workspaceId}
              </option>
            ),
          )}
        </select>
        <select
          aria-label="Intent filter"
          style={styles.filterSelect}
          value={filters.intent ?? "all"}
          onChange={(event) =>
            onFiltersChange?.({
              ...filters,
              intent:
                event.currentTarget.value === "all"
                  ? undefined
                  : event.currentTarget.value,
              offset: 0,
            })
          }
        >
          <option value="all">All intents</option>
          {uniqueValues(runs.flatMap((run) => run.selectedIntents)).map(
            (intent) => (
              <option key={intent} value={intent}>
                {intent}
              </option>
            ),
          )}
        </select>
        <select
          aria-label="Status filter"
          style={styles.filterSelect}
          value={filters.status ?? "all"}
          onChange={(event) =>
            onFiltersChange?.({
              ...filters,
              status:
                event.currentTarget.value === "all"
                  ? undefined
                  : (event.currentTarget.value as AdminAgenticRunStatus),
              offset: 0,
            })
          }
        >
          <option value="all">All statuses</option>
          {["success", "warning", "blocked", "failed", "running"].map(
            (status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ),
          )}
        </select>
      </div>

      {stale ? <div style={styles.staleBanner}>Showing stale data</div> : null}

      {state === "loading" && runs.length === 0 ? (
        <div role="status" style={styles.stateBox}>
          <Clock3 aria-hidden size={18} />
          Loading agentic runs
        </div>
      ) : state === "error" ? (
        <div role="alert" style={styles.errorBox}>
          <AlertTriangle aria-hidden size={18} />
          {errorMessage ?? "Unable to load agentic runs"}
        </div>
      ) : runs.length === 0 ? (
        <div style={styles.emptyBox}>
          <FileSearch aria-hidden size={20} />
          <strong>No agentic run evidence yet</strong>
        </div>
      ) : (
        <div style={styles.grid}>
          <aside aria-label="Run and thread list" style={styles.runList}>
            {runs.map((run) => (
              <RunListItem
                key={run.runId}
                run={run}
                selected={run.runId === selectedSummary?.runId}
                onSelect={onRunSelect}
              />
            ))}
          </aside>

          <main style={styles.timelinePane}>
            <section style={styles.sectionHeader}>
              <div>
                <p style={styles.eyebrow}>Thread</p>
                <h2 style={styles.sectionTitle}>
                  {selectedSummary?.threadId ?? "No thread selected"}
                </h2>
              </div>
              <div style={styles.inlineActions}>
                <button
                  aria-label="Toggle graph view"
                  aria-pressed={graphVisible}
                  onClick={() => setGraphVisible((visible) => !visible)}
                  style={styles.iconButton}
                  type="button"
                >
                  <GitBranch aria-hidden size={16} />
                </button>
                {selectedSummary ? (
                  <StatusPill status={selectedSummary.status} />
                ) : null}
              </div>
            </section>
            <ol aria-label="Logical timeline" style={styles.timeline}>
              {(selectedRun?.timeline ?? []).map((step) => (
                <li key={step.id} style={styles.timelineItem}>
                  <span style={styles.sequence}>{step.sequence}</span>
                  <div style={styles.timelineBody}>
                    <strong>{step.label}</strong>
                    <span style={styles.metaLine}>
                      {step.step}
                      {step.durationMs === undefined
                        ? ""
                        : ` - ${step.durationMs}ms`}
                    </span>
                    {step.warningCodes.length > 0 ? (
                      <span style={styles.warningText}>
                        {step.warningCodes.join(", ")}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
            {graphVisible ? <GraphPathView selectedRun={selectedRun} /> : null}
          </main>

          <aside style={styles.detailPane}>
            <div
              role="tablist"
              aria-label="Run detail tabs"
              style={styles.tabs}
            >
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  role="tab"
                  aria-selected={tab === activeTab}
                  style={{
                    ...styles.tab,
                    ...(tab === activeTab ? styles.activeTab : {}),
                  }}
                  type="button"
                >
                  {tab}
                </button>
              ))}
            </div>
            <DetailTabPanel
              activeTab={activeTab}
              copyJson={copyJson}
              copyState={copyState}
              rawJsonText={rawJsonText}
              selectedRun={selectedRun}
              stateExpanded={stateExpanded}
              toggleStateExpanded={() =>
                setStateExpanded((expanded) => !expanded)
              }
            />
            <section
              aria-label="Capability catalog"
              style={styles.detailSection}
            >
              <h3 style={styles.detailTitle}>Capability Catalog</h3>
              {capabilities.length === 0 ? (
                <p style={styles.bodyText}>Capability registry unavailable</p>
              ) : (
                Object.entries(groupedCapabilities).map(([intent, entries]) => (
                  <div key={intent} style={styles.capabilityGroup}>
                    <strong>{intent}</strong>
                    {entries.map((entry) => (
                      <div key={entry.id} style={styles.capabilityRow}>
                        <span style={styles.runId}>{entry.id}</span>
                        <span style={styles.metaLine}>
                          {entry.kind} -{" "}
                          {entry.readOnly ? "read-only" : "write-capable"} -{" "}
                          {entry.requiresApproval
                            ? "approval required"
                            : "no approval"}
                        </span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </section>
          </aside>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.metric}>
      <span style={styles.metricValue}>{value}</span>
      <span style={styles.metricLabel}>{label}</span>
    </div>
  );
}

function RunListItem({
  run,
  selected,
  onSelect,
}: {
  run: AdminAgenticRunSummary;
  selected: boolean;
  onSelect?: (runId: string) => void;
}) {
  return (
    <button
      aria-current={selected ? "true" : undefined}
      aria-label={`Open run ${run.runId}`}
      onClick={() => onSelect?.(run.runId)}
      style={{
        ...styles.runItem,
        ...styles.runItemButton,
        ...(selected ? styles.selectedRun : {}),
      }}
      type="button"
    >
      <span style={styles.runItemHeader}>
        <StatusPill status={run.status} />
        <span style={styles.metaLine}>{run.selectedIntents.join(", ")}</span>
      </span>
      <strong style={styles.runId}>{run.runId}</strong>
      <span style={styles.metaLine}>{run.threadId}</span>
      <span style={styles.runMetrics}>
        <span>{run.toolCallCount} tools</span>
        <span>{run.warningCount} warnings</span>
        <span>
          {run.missingEvidenceCount === 0
            ? "0 missing"
            : run.blockingMissingEvidenceCount > 0
              ? "blocking evidence"
              : "no evidence"}
        </span>
      </span>
    </button>
  );
}

function DetailTabPanel({
  activeTab,
  copyJson,
  copyState,
  rawJsonText,
  selectedRun,
  stateExpanded,
  toggleStateExpanded,
}: {
  activeTab: DetailTab;
  copyJson: () => Promise<void>;
  copyState: "idle" | "copied" | "failed";
  rawJsonText: string;
  selectedRun?: AdminAgenticRunDetail;
  stateExpanded: boolean;
  toggleStateExpanded: () => void;
}) {
  if (activeTab === "Tool Calls") {
    const toolCalls = selectedRun?.evidence.toolCalls ?? [];
    return (
      <section style={styles.detailSection}>
        <h3 style={styles.detailTitle}>Tool Calls</h3>
        {toolCalls.length === 0 ? (
          <p style={styles.bodyText}>No tool calls recorded</p>
        ) : (
          toolCalls.map((toolCall) => (
            <div
              key={`${toolCall.toolName}-${toolCall.status}`}
              style={styles.toolRow}
            >
              <Wrench aria-hidden size={16} />
              <div>
                <strong>{toolCall.toolName}</strong>
                <p style={styles.metaLine}>
                  {toolCall.status}
                  {toolCall.latencyMs === undefined
                    ? ""
                    : ` - ${toolCall.latencyMs}ms`}
                </p>
                {toolCall.outputSummary ? (
                  <p style={styles.bodyText}>{toolCall.outputSummary}</p>
                ) : null}
              </div>
            </div>
          ))
        )}
      </section>
    );
  }

  if (activeTab === "Sources") {
    return (
      <section style={styles.detailSection}>
        <h3 style={styles.detailTitle}>Sources</h3>
        {(selectedRun?.evidence.sources ?? []).map((source) => (
          <div key={source.id ?? source.name} style={styles.toolRow}>
            <FileSearch aria-hidden size={16} />
            <div>
              <strong>{source.name}</strong>
              <p style={styles.metaLine}>
                {source.kind} - {source.retrievedDocumentIds.length} documents
              </p>
            </div>
          </div>
        ))}
        {(selectedRun?.evidence.retrievedDocuments ?? []).map((document) => (
          <div key={document.id ?? document.title} style={styles.toolRow}>
            <FileSearch aria-hidden size={16} />
            <div>
              <strong>{document.title}</strong>
              {document.excerpt ? (
                <p style={styles.bodyText}>{document.excerpt}</p>
              ) : null}
            </div>
          </div>
        ))}
        {(selectedRun?.evidence.sources.length ?? 0) === 0 &&
        (selectedRun?.evidence.retrievedDocuments.length ?? 0) === 0 ? (
          <p style={styles.bodyText}>No sources recorded</p>
        ) : null}
      </section>
    );
  }

  if (activeTab === "Missing Evidence") {
    return (
      <section style={styles.detailSection}>
        <h3 style={styles.detailTitle}>Missing Evidence</h3>
        {(selectedRun?.evidence.missingEvidence ?? []).map((item) => (
          <div key={`${item.severity}-${item.reason}`} style={styles.toolRow}>
            <AlertTriangle aria-hidden size={16} />
            <div>
              <strong>{item.severity}</strong>
              <p style={styles.bodyText}>{item.reason}</p>
              {item.expectedEvidence ? (
                <p style={styles.metaLine}>{item.expectedEvidence}</p>
              ) : null}
            </div>
          </div>
        ))}
        {(selectedRun?.evidence.missingEvidence.length ?? 0) === 0 ? (
          <p style={styles.bodyText}>No missing evidence recorded</p>
        ) : null}
      </section>
    );
  }

  if (activeTab === "Confidence") {
    return (
      <section style={styles.detailSection}>
        <h3 style={styles.detailTitle}>Confidence</h3>
        {(selectedRun?.evidence.confidenceSignals ?? []).map((signal) => (
          <div
            key={`${signal.label}-${signal.direction}`}
            style={styles.toolRow}
          >
            <CheckCircle2 aria-hidden size={16} />
            <div>
              <strong>{signal.label}</strong>
              <p style={styles.metaLine}>
                {signal.direction}
                {signal.score === undefined ? "" : ` - ${signal.score}`}
              </p>
              {signal.rationale ? (
                <p style={styles.bodyText}>{signal.rationale}</p>
              ) : null}
            </div>
          </div>
        ))}
        {(selectedRun?.evidence.confidenceSignals.length ?? 0) === 0 ? (
          <p style={styles.bodyText}>No confidence signals recorded</p>
        ) : null}
      </section>
    );
  }

  if (activeTab === "JSON") {
    return (
      <section style={styles.detailSection}>
        <h3 style={styles.detailTitle}>
          JSON
          <button
            aria-label="Copy JSON"
            onClick={() => void copyJson()}
            style={styles.iconButton}
            type="button"
          >
            <Copy aria-hidden size={14} />
          </button>
        </h3>
        {copyState === "copied" ? (
          <p style={styles.metaLine}>Copied JSON</p>
        ) : null}
        {copyState === "failed" ? (
          <p style={styles.warningText}>Copy failed</p>
        ) : null}
        <pre style={styles.jsonPreview}>{rawJsonText}</pre>
      </section>
    );
  }

  return (
    <section style={styles.detailSection}>
      <h3 style={styles.detailTitle}>
        State Detail
        <button
          aria-expanded={stateExpanded}
          aria-label="Expand state detail"
          onClick={toggleStateExpanded}
          style={styles.iconButton}
          type="button"
        >
          <ChevronDown aria-hidden size={14} />
        </button>
      </h3>
      <p style={styles.bodyText}>{selectedRun?.input ?? "No input"}</p>
      {selectedRun?.standaloneQuery ? (
        <p style={styles.metaLine}>{selectedRun.standaloneQuery}</p>
      ) : null}
      {selectedRun?.finalAnswer ? (
        <p style={styles.answerText}>{selectedRun.finalAnswer}</p>
      ) : null}
      {stateExpanded ? (
        <pre style={styles.jsonPreview}>{rawJsonText}</pre>
      ) : null}
    </section>
  );
}

function StatusPill({ status }: { status: AdminAgenticRunSummary["status"] }) {
  const Icon = statusIcons[status];
  return (
    <span style={{ ...styles.statusPill, ...statusStyle(status) }}>
      <Icon aria-hidden size={14} />
      {statusLabels[status]}
    </span>
  );
}

function statusStyle(status: AdminAgenticRunSummary["status"]): CSSProperties {
  if (status === "success") return styles.statusSuccess;
  if (status === "warning") return styles.statusWarning;
  if (status === "blocked") return styles.statusBlocked;
  if (status === "running") return styles.statusRunning;
  return styles.statusFailed;
}

function GraphPathView({
  selectedRun,
}: {
  selectedRun?: AdminAgenticRunDetail;
}) {
  const timeline = selectedRun?.timeline ?? [];
  const nodes = timeline.length > 0 ? timeline : defaultTopology(selectedRun);

  return (
    <section aria-label="Graph path visualization" style={styles.graphSection}>
      <div style={styles.sectionHeader}>
        <div>
          <p style={styles.eyebrow}>Graph</p>
          <h3 style={styles.sectionTitle}>Executed Path</h3>
        </div>
      </div>
      {timeline.length === 0 ? (
        <p style={styles.bodyText}>
          Runtime audit unavailable; showing static topology.
        </p>
      ) : null}
      <div style={styles.graphRail}>
        {nodes.map((node) => (
          <div key={node.id} style={styles.graphNode}>
            <strong>{node.label}</strong>
            <span style={styles.metaLine}>
              {node.step}
              {node.durationMs === undefined ? "" : ` - ${node.durationMs}ms`}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function defaultTopology(selectedRun?: AdminAgenticRunDetail) {
  const runId = selectedRun?.summary.runId ?? "static";
  return [
    "input",
    "query_rewrite",
    "route_intent",
    "workflow_result",
    "final_answer",
  ].map<AdminAgenticRunDetail["timeline"][number]>((step, index) => ({
    id: `${runId}:${step}`,
    runId,
    sequence: index + 1,
    step: step as AdminAgenticRunDetail["timeline"][number]["step"],
    label: step
      .split("_")
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(" "),
    status: "pending" as const,
    warningCodes: [],
    evidenceRefs: [],
  }));
}

function groupCapabilities(entries: AdminAgenticCapabilityCatalogEntry[]) {
  return entries.reduce<Record<string, AdminAgenticCapabilityCatalogEntry[]>>(
    (groups, entry) => {
      groups[entry.intent] = [...(groups[entry.intent] ?? []), entry];
      return groups;
    },
    {},
  );
}

function uniqueValues(values: Array<string | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

const border = "1px solid #d8dee6";

const styles = {
  shell: {
    minHeight: "100vh",
    background: "#f5f7fa",
    color: "#18202b",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  },
  header: {
    alignItems: "center",
    background: "#ffffff",
    borderBottom: border,
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
    padding: "18px 24px",
  },
  eyebrow: {
    color: "#5d6b7a",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0,
    margin: 0,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 24,
    lineHeight: 1.2,
    margin: "4px 0 0",
  },
  headerStats: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  metric: {
    alignItems: "flex-end",
    border: border,
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    minWidth: 92,
    padding: "8px 10px",
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 800,
  },
  metricLabel: {
    color: "#5d6b7a",
    fontSize: 12,
  },
  filterBar: {
    alignItems: "center",
    background: "#ffffff",
    borderBottom: border,
    display: "grid",
    gap: 10,
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    padding: "12px 24px",
  },
  searchLabel: {
    alignItems: "center",
    border: border,
    borderRadius: 8,
    display: "flex",
    gap: 8,
    padding: "0 10px",
  },
  searchInput: {
    background: "transparent",
    border: 0,
    color: "#18202b",
    fontSize: 14,
    height: 36,
    outline: "none",
    width: "100%",
  },
  filterSelect: {
    background: "#ffffff",
    border,
    borderRadius: 8,
    color: "#18202b",
    height: 38,
    padding: "0 10px",
  },
  grid: {
    display: "grid",
    gap: 0,
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    minHeight: "calc(100vh - 122px)",
  },
  runList: {
    background: "#ffffff",
    borderRight: border,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 12,
  },
  runItem: {
    border,
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 12,
  },
  runItemButton: {
    background: "#ffffff",
    color: "inherit",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  },
  selectedRun: {
    boxShadow: "inset 3px 0 0 #2f6feb",
    outline: "1px solid #2f6feb",
  },
  runItemHeader: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
  },
  runId: {
    fontSize: 14,
    overflowWrap: "anywhere",
  },
  runMetrics: {
    color: "#5d6b7a",
    display: "flex",
    flexWrap: "wrap",
    fontSize: 12,
    gap: 8,
  },
  statusPill: {
    alignItems: "center",
    borderRadius: 999,
    display: "inline-flex",
    fontSize: 12,
    fontWeight: 700,
    gap: 5,
    padding: "3px 8px",
  },
  statusSuccess: {
    background: "#e7f6ee",
    color: "#116b3a",
  },
  statusWarning: {
    background: "#fff4d7",
    color: "#7a4d00",
  },
  statusBlocked: {
    background: "#f1e7ff",
    color: "#5a32a3",
  },
  statusFailed: {
    background: "#ffe8e8",
    color: "#a11d1d",
  },
  statusRunning: {
    background: "#e9eef5",
    color: "#344054",
  },
  timelinePane: {
    padding: 18,
  },
  sectionHeader: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  inlineActions: {
    alignItems: "center",
    display: "flex",
    gap: 8,
  },
  iconButton: {
    alignItems: "center",
    background: "#ffffff",
    border,
    borderRadius: 8,
    color: "#344054",
    display: "inline-flex",
    height: 30,
    justifyContent: "center",
    padding: 0,
    width: 30,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 1.3,
    margin: "3px 0 0",
    overflowWrap: "anywhere",
  },
  timeline: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  timelineItem: {
    alignItems: "flex-start",
    background: "#ffffff",
    border,
    borderRadius: 8,
    display: "flex",
    gap: 12,
    padding: 12,
  },
  sequence: {
    alignItems: "center",
    background: "#e9eef5",
    borderRadius: 8,
    display: "inline-flex",
    fontSize: 12,
    fontWeight: 800,
    height: 26,
    justifyContent: "center",
    width: 26,
  },
  timelineBody: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  warningText: {
    color: "#7a4d00",
    fontSize: 12,
    fontWeight: 700,
  },
  detailPane: {
    background: "#ffffff",
    borderLeft: border,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  tabs: {
    borderBottom: border,
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    padding: 10,
  },
  tab: {
    background: "#f5f7fa",
    border,
    borderRadius: 8,
    color: "#344054",
    cursor: "default",
    fontSize: 12,
    fontWeight: 700,
    height: 30,
    padding: "0 10px",
  },
  activeTab: {
    background: "#18202b",
    color: "#ffffff",
    outline: "1px solid #18202b",
  },
  detailSection: {
    borderBottom: border,
    padding: 14,
  },
  detailTitle: {
    alignItems: "center",
    display: "flex",
    fontSize: 14,
    gap: 6,
    justifyContent: "space-between",
    margin: "0 0 8px",
  },
  bodyText: {
    color: "#344054",
    fontSize: 14,
    lineHeight: 1.45,
    margin: 0,
  },
  answerText: {
    background: "#f5f7fa",
    border,
    borderRadius: 8,
    color: "#18202b",
    fontSize: 13,
    lineHeight: 1.45,
    margin: "10px 0 0",
    padding: 10,
  },
  toolRow: {
    alignItems: "flex-start",
    border,
    borderRadius: 8,
    display: "flex",
    gap: 8,
    marginTop: 8,
    padding: 10,
  },
  metaLine: {
    color: "#5d6b7a",
    fontSize: 12,
    lineHeight: 1.35,
  },
  jsonPreview: {
    background: "#111827",
    borderRadius: 8,
    color: "#e5e7eb",
    fontSize: 12,
    lineHeight: 1.45,
    margin: "10px 0 0",
    maxHeight: 180,
    overflow: "auto",
    padding: 10,
  },
  staleBanner: {
    background: "#fff4d7",
    borderBottom: border,
    color: "#7a4d00",
    fontSize: 13,
    fontWeight: 700,
    padding: "8px 24px",
  },
  graphSection: {
    background: "#ffffff",
    border,
    borderRadius: 8,
    marginTop: 16,
    padding: 12,
  },
  graphRail: {
    display: "grid",
    gap: 8,
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    marginTop: 10,
  },
  graphNode: {
    border,
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minHeight: 62,
    padding: 10,
  },
  capabilityGroup: {
    border,
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 8,
    padding: 10,
  },
  capabilityRow: {
    background: "#f5f7fa",
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    gap: 3,
    padding: 8,
  },
  stateBox: {
    alignItems: "center",
    color: "#344054",
    display: "flex",
    gap: 8,
    padding: 24,
  },
  errorBox: {
    alignItems: "center",
    background: "#fff4d7",
    color: "#7a4d00",
    display: "flex",
    gap: 8,
    margin: 24,
    padding: 14,
    borderRadius: 8,
  },
  emptyBox: {
    alignItems: "center",
    color: "#344054",
    display: "flex",
    gap: 8,
    padding: 24,
  },
} satisfies Record<string, CSSProperties>;
