import type {
  AdminAgenticRunStatus,
  AdminAgenticSanitizedJsonPayload,
  AdminAgenticStepStatus,
  AdminAgenticTimelineStep,
  AdminAgenticToolCallStatus,
} from "@agent-toolkit/types";
import {
  redactAdminAgenticPayload,
  type AdminAgenticRedactionOptions,
} from "./agentic-inspector.contract.js";

export type AgenticDurableRunStatus = AdminAgenticRunStatus | "running";

export type AgenticAuditEventType =
  | "run_started"
  | "step_started"
  | "step_completed"
  | "step_warning"
  | "tool_call"
  | "run_completed"
  | "run_failed";

export interface AgenticRunAuditContext {
  runId: string;
  threadId: string;
  workspaceId?: string;
  startedAt: string;
}

export interface AgenticRunAuditRunRecord {
  runId: string;
  threadId: string;
  workspaceId?: string;
  status: AgenticDurableRunStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  selectedIntents: string[];
  warningCodes: string[];
  evidenceRefs: string[];
  stateDelta?: AdminAgenticSanitizedJsonPayload;
  retainedUntil: string;
}

export interface AgenticRunAuditEventRecord {
  eventId: string;
  runId: string;
  threadId: string;
  sequence: number;
  eventType: AgenticAuditEventType;
  nodeName: string;
  logicalStep?: AdminAgenticTimelineStep;
  status: AdminAgenticStepStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  warningCodes: string[];
  evidenceRefs: string[];
  stateDelta?: AdminAgenticSanitizedJsonPayload;
}

export interface AgenticToolCallAuditRecord {
  toolCallId: string;
  eventId: string;
  runId: string;
  threadId: string;
  sequence: number;
  toolName: string;
  status: AdminAgenticToolCallStatus;
  capabilityId?: string;
  serverId?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  warningCodes: string[];
  evidenceRefs: string[];
  input?: AdminAgenticSanitizedJsonPayload;
  output?: AdminAgenticSanitizedJsonPayload;
  errorMessage?: string;
}

export interface AgenticRunAuditStore {
  createRun(record: AgenticRunAuditRunRecord): Promise<void>;
  appendEvent(record: AgenticRunAuditEventRecord): Promise<void>;
  appendToolCall(record: AgenticToolCallAuditRecord): Promise<void>;
  completeRun(record: AgenticRunAuditRunRecord): Promise<void>;
  failRun(record: AgenticRunAuditRunRecord): Promise<void>;
}

export interface AgenticRunAuditRecorderOptions extends AdminAgenticRedactionOptions {
  now?: () => Date;
  idFactory?: (prefix: string) => string;
  retentionDays?: number;
}

export interface StartAgenticRunAuditInput {
  threadId: string;
  workspaceId?: string;
  runId?: string;
  startedAt?: string;
  stateDelta?: unknown;
}

export interface RecordAgenticRunStepInput {
  nodeName: string;
  logicalStep?: AdminAgenticTimelineStep;
  status: AdminAgenticStepStatus;
  startedAt?: string;
  completedAt?: string;
  warningCodes?: string[];
  evidenceRefs?: string[];
  stateDelta?: unknown;
}

export interface RecordAgenticToolCallInput {
  toolName: string;
  status: AdminAgenticToolCallStatus;
  capabilityId?: string;
  serverId?: string;
  startedAt?: string;
  completedAt?: string;
  warningCodes?: string[];
  evidenceRefs?: string[];
  input?: unknown;
  output?: unknown;
  errorMessage?: string;
}

export interface CompleteAgenticRunAuditInput {
  completedAt?: string;
  selectedIntents?: string[];
  warningCodes?: string[];
  evidenceRefs?: string[];
  stateDelta?: unknown;
}

export class AgenticRunAuditRecorder {
  private readonly now: () => Date;
  private readonly idFactory: (prefix: string) => string;
  private readonly retentionDays: number;
  private readonly redactionOptions: AdminAgenticRedactionOptions;
  private readonly sequenceByRunId = new Map<string, number>();
  private readonly warningCodesByRunId = new Map<string, string[]>();

  constructor(
    private readonly store: AgenticRunAuditStore,
    options: AgenticRunAuditRecorderOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? defaultIdFactory;
    this.retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
    this.redactionOptions = {
      redactedArgumentKeys: options.redactedArgumentKeys,
      maxStringLength: options.maxStringLength,
      maxPayloadBytes: options.maxPayloadBytes,
    };
  }

  async startRun(
    input: StartAgenticRunAuditInput,
  ): Promise<AgenticRunAuditContext> {
    const startedAt = input.startedAt ?? this.now().toISOString();
    const run = {
      runId: input.runId ?? this.idFactory("run"),
      threadId: input.threadId,
      workspaceId: input.workspaceId,
      startedAt,
    };

    this.sequenceByRunId.set(run.runId, 0);
    this.warningCodesByRunId.set(run.runId, []);

    await this.store.createRun({
      ...run,
      status: "running",
      selectedIntents: [],
      warningCodes: [],
      evidenceRefs: [],
      ...(input.stateDelta === undefined
        ? {}
        : { stateDelta: this.redact(input.stateDelta) }),
      retainedUntil: addDays(startedAt, this.retentionDays),
    });
    await this.store.appendEvent({
      eventId: this.idFactory("event"),
      runId: run.runId,
      threadId: run.threadId,
      sequence: this.nextSequence(run.runId),
      eventType: "run_started",
      nodeName: "chat",
      status: "running",
      startedAt,
      warningCodes: [],
      evidenceRefs: [],
      ...(input.stateDelta === undefined
        ? {}
        : { stateDelta: this.redact(input.stateDelta) }),
    });

    return run;
  }

  async recordStep(
    run: AgenticRunAuditContext,
    input: RecordAgenticRunStepInput,
  ): Promise<void> {
    const warningCodes = this.addRunWarnings(run.runId, input.warningCodes);
    await this.store.appendEvent({
      eventId: this.idFactory("event"),
      runId: run.runId,
      threadId: run.threadId,
      sequence: this.nextSequence(run.runId),
      eventType: eventTypeForStep(input.status, warningCodes.length),
      nodeName: input.nodeName,
      logicalStep: input.logicalStep,
      status: input.status,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs: durationMs(input.startedAt, input.completedAt),
      warningCodes,
      evidenceRefs: input.evidenceRefs ?? [],
      ...(input.stateDelta === undefined
        ? {}
        : { stateDelta: this.redact(input.stateDelta) }),
    });
  }

  async recordToolCall(
    run: AgenticRunAuditContext,
    input: RecordAgenticToolCallInput,
  ): Promise<void> {
    const sequence = this.nextSequence(run.runId);
    const warningCodes = this.addRunWarnings(run.runId, input.warningCodes);
    const eventId = this.idFactory("event");
    const common = {
      runId: run.runId,
      threadId: run.threadId,
      sequence,
      warningCodes,
      evidenceRefs: input.evidenceRefs ?? [],
    };

    await this.store.appendEvent({
      ...common,
      eventId,
      eventType: "tool_call",
      nodeName: input.toolName,
      status: input.status === "failed" ? "failed" : "completed",
      logicalStep: "tool_call",
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs: durationMs(input.startedAt, input.completedAt),
      ...(input.output === undefined
        ? {}
        : { stateDelta: this.redact(input.output) }),
    });
    await this.store.appendToolCall({
      ...common,
      toolCallId: this.idFactory("tool_call"),
      eventId,
      toolName: input.toolName,
      status: input.status,
      capabilityId: input.capabilityId,
      serverId: input.serverId,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs: durationMs(input.startedAt, input.completedAt),
      ...(input.input === undefined ? {} : { input: this.redact(input.input) }),
      ...(input.output === undefined
        ? {}
        : { output: this.redact(input.output) }),
      errorMessage: input.errorMessage,
    });
  }

  async completeRun(
    run: AgenticRunAuditContext,
    input: CompleteAgenticRunAuditInput = {},
  ): Promise<void> {
    const completedAt = input.completedAt ?? this.now().toISOString();
    const warningCodes = this.addRunWarnings(run.runId, input.warningCodes);
    const status: AgenticDurableRunStatus =
      warningCodes.length > 0 ? "warning" : "success";
    const record = this.buildFinishedRunRecord(run, input, completedAt, status);

    await this.store.appendEvent({
      eventId: this.idFactory("event"),
      runId: run.runId,
      threadId: run.threadId,
      sequence: this.nextSequence(run.runId),
      eventType: "run_completed",
      nodeName: "chat",
      status: "completed",
      startedAt: run.startedAt,
      completedAt,
      durationMs: durationMs(run.startedAt, completedAt),
      warningCodes,
      evidenceRefs: input.evidenceRefs ?? [],
      ...(input.stateDelta === undefined
        ? {}
        : { stateDelta: this.redact(input.stateDelta) }),
    });
    await this.store.completeRun(record);
  }

  async failRun(
    run: AgenticRunAuditContext,
    input: CompleteAgenticRunAuditInput = {},
  ): Promise<void> {
    const completedAt = input.completedAt ?? this.now().toISOString();
    const warningCodes = this.addRunWarnings(run.runId, input.warningCodes);
    const record = this.buildFinishedRunRecord(
      run,
      input,
      completedAt,
      "failed",
    );

    await this.store.appendEvent({
      eventId: this.idFactory("event"),
      runId: run.runId,
      threadId: run.threadId,
      sequence: this.nextSequence(run.runId),
      eventType: "run_failed",
      nodeName: "chat",
      status: "failed",
      startedAt: run.startedAt,
      completedAt,
      durationMs: durationMs(run.startedAt, completedAt),
      warningCodes,
      evidenceRefs: input.evidenceRefs ?? [],
      ...(input.stateDelta === undefined
        ? {}
        : { stateDelta: this.redact(input.stateDelta) }),
    });
    await this.store.failRun(record);
  }

  private buildFinishedRunRecord(
    run: AgenticRunAuditContext,
    input: CompleteAgenticRunAuditInput,
    completedAt: string,
    status: AgenticDurableRunStatus,
  ): AgenticRunAuditRunRecord {
    return {
      ...run,
      completedAt,
      status,
      durationMs: durationMs(run.startedAt, completedAt),
      selectedIntents: input.selectedIntents ?? [],
      warningCodes: this.warningCodesByRunId.get(run.runId) ?? [],
      evidenceRefs: input.evidenceRefs ?? [],
      ...(input.stateDelta === undefined
        ? {}
        : { stateDelta: this.redact(input.stateDelta) }),
      retainedUntil: addDays(run.startedAt, this.retentionDays),
    };
  }

  private nextSequence(runId: string): number {
    const next = (this.sequenceByRunId.get(runId) ?? 0) + 1;
    this.sequenceByRunId.set(runId, next);
    return next;
  }

  private addRunWarnings(runId: string, warningCodes: string[] = []): string[] {
    const current = this.warningCodesByRunId.get(runId) ?? [];
    const next = [...new Set([...current, ...warningCodes])];
    this.warningCodesByRunId.set(runId, next);
    return next;
  }

  private redact(value: unknown): AdminAgenticSanitizedJsonPayload {
    return redactAdminAgenticPayload(value, this.redactionOptions);
  }
}

const DEFAULT_RETENTION_DAYS = 90;

export function getAgenticRunAuditStoragePlan() {
  return {
    retentionDays: DEFAULT_RETENTION_DAYS,
    tables: {
      runs: "agentic_run_audits",
      events: "agentic_run_events",
      toolCalls: "agentic_tool_call_audits",
    },
    indexedQueryPatterns: [
      "runId detail lookup",
      "threadId ordered run history",
      "runId ordered event timeline",
      "threadId ordered event timeline",
      "retention cleanup by retainedUntil",
      "tool call lookup by runId and sequence",
    ],
  };
}

function eventTypeForStep(
  status: AdminAgenticStepStatus,
  warningCount: number,
): AgenticAuditEventType {
  if (warningCount > 0) return "step_warning";
  if (status === "running") return "step_started";
  return "step_completed";
}

function durationMs(
  startedAt?: string,
  completedAt?: string,
): number | undefined {
  if (!startedAt || !completedAt) return undefined;
  return Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
}

function addDays(timestamp: string, days: number): string {
  const date = new Date(timestamp);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function defaultIdFactory(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
