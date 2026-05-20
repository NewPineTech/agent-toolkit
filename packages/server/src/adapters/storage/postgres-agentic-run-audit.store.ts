import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { AdminAgenticRunStatus } from "@agent-toolkit/types";
import { schema, type Database } from "../../db/index.js";
import type {
  AgenticDurableRunStatus,
  AgenticRunAuditEventRecord,
  AgenticRunAuditRunRecord,
  AgenticRunAuditStore,
  AgenticToolCallAuditRecord,
} from "../../admin/agentic-run-audit.recorder.js";

export interface AgenticRunAuditListFilters {
  workspaceId?: string;
  threadId?: string;
  status?: AdminAgenticRunStatus | "running";
  intent?: string;
  startedFrom?: string;
  startedTo?: string;
  limit: number;
  offset: number;
}

export interface AgenticRunAuditReadStore extends AgenticRunAuditStore {
  listRuns(
    filters: AgenticRunAuditListFilters,
  ): Promise<AgenticRunAuditRunRecord[]>;
  getRun(runId: string): Promise<AgenticRunAuditRunRecord | null>;
  listEventsForRun(runId: string): Promise<AgenticRunAuditEventRecord[]>;
  listEventsForThread(threadId: string): Promise<AgenticRunAuditEventRecord[]>;
  listToolCallsForRun(runId: string): Promise<AgenticToolCallAuditRecord[]>;
}

export class PostgresAgenticRunAuditStore implements AgenticRunAuditReadStore {
  constructor(private readonly db: Database) {}

  async createRun(record: AgenticRunAuditRunRecord): Promise<void> {
    await this.db.insert(schema.agenticRunAudits).values(toRunRow(record));
  }

  async appendEvent(record: AgenticRunAuditEventRecord): Promise<void> {
    await this.db.insert(schema.agenticRunEvents).values(toEventRow(record));
  }

  async appendToolCall(record: AgenticToolCallAuditRecord): Promise<void> {
    await this.db
      .insert(schema.agenticToolCallAudits)
      .values(toToolCallRow(record));
  }

  async completeRun(record: AgenticRunAuditRunRecord): Promise<void> {
    await this.updateFinishedRun(record);
  }

  async failRun(record: AgenticRunAuditRunRecord): Promise<void> {
    await this.updateFinishedRun(record);
  }

  async listRuns(
    filters: AgenticRunAuditListFilters,
  ): Promise<AgenticRunAuditRunRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.agenticRunAudits)
      .where(buildRunFilters(filters))
      .orderBy(desc(schema.agenticRunAudits.startedAt))
      .limit(filters.limit)
      .offset(filters.offset);

    return rows.map(fromRunRow);
  }

  async getRun(runId: string): Promise<AgenticRunAuditRunRecord | null> {
    const rows = await this.db
      .select()
      .from(schema.agenticRunAudits)
      .where(eq(schema.agenticRunAudits.runId, runId))
      .limit(1);
    return rows[0] ? fromRunRow(rows[0]) : null;
  }

  async listEventsForRun(runId: string): Promise<AgenticRunAuditEventRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.agenticRunEvents)
      .where(eq(schema.agenticRunEvents.runId, runId))
      .orderBy(schema.agenticRunEvents.sequence);
    return rows.map(fromEventRow);
  }

  async listEventsForThread(
    threadId: string,
  ): Promise<AgenticRunAuditEventRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.agenticRunEvents)
      .where(eq(schema.agenticRunEvents.threadId, threadId))
      .orderBy(schema.agenticRunEvents.sequence);
    return rows.map(fromEventRow);
  }

  async listToolCallsForRun(
    runId: string,
  ): Promise<AgenticToolCallAuditRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.agenticToolCallAudits)
      .where(eq(schema.agenticToolCallAudits.runId, runId))
      .orderBy(schema.agenticToolCallAudits.sequence);
    return rows.map(fromToolCallRow);
  }

  private async updateFinishedRun(record: AgenticRunAuditRunRecord) {
    await this.db
      .update(schema.agenticRunAudits)
      .set(toRunRow(record))
      .where(eq(schema.agenticRunAudits.runId, record.runId));
  }
}

function buildRunFilters(filters: AgenticRunAuditListFilters): SQL | undefined {
  const clauses: SQL[] = [];
  if (filters.workspaceId) {
    clauses.push(eq(schema.agenticRunAudits.workspaceId, filters.workspaceId));
  }
  if (filters.threadId) {
    clauses.push(eq(schema.agenticRunAudits.threadId, filters.threadId));
  }
  if (filters.status) {
    clauses.push(eq(schema.agenticRunAudits.status, filters.status));
  }
  if (filters.intent) {
    clauses.push(
      sql`${filters.intent} = any(${schema.agenticRunAudits.selectedIntents})`,
    );
  }
  if (filters.startedFrom) {
    clauses.push(
      gte(schema.agenticRunAudits.startedAt, new Date(filters.startedFrom)),
    );
  }
  if (filters.startedTo) {
    clauses.push(
      lte(schema.agenticRunAudits.startedAt, new Date(filters.startedTo)),
    );
  }
  return clauses.length === 0 ? undefined : and(...clauses);
}

function toRunRow(record: AgenticRunAuditRunRecord) {
  return {
    runId: record.runId,
    threadId: record.threadId,
    workspaceId: record.workspaceId,
    status: record.status,
    startedAt: new Date(record.startedAt),
    completedAt: record.completedAt ? new Date(record.completedAt) : null,
    durationMs: record.durationMs ?? null,
    selectedIntents: record.selectedIntents,
    warningCodes: record.warningCodes,
    evidenceRefs: record.evidenceRefs,
    stateDelta: record.stateDelta ?? null,
    retainedUntil: new Date(record.retainedUntil),
  };
}

function fromRunRow(
  row: typeof schema.agenticRunAudits.$inferSelect,
): AgenticRunAuditRunRecord {
  return {
    runId: row.runId,
    threadId: row.threadId,
    workspaceId: row.workspaceId ?? undefined,
    status: row.status as AgenticDurableRunStatus,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    durationMs: row.durationMs ?? undefined,
    selectedIntents: row.selectedIntents,
    warningCodes: row.warningCodes,
    evidenceRefs: row.evidenceRefs,
    stateDelta: row.stateDelta as AgenticRunAuditRunRecord["stateDelta"],
    retainedUntil: row.retainedUntil.toISOString(),
  };
}

function toEventRow(record: AgenticRunAuditEventRecord) {
  return {
    eventId: record.eventId,
    runId: record.runId,
    threadId: record.threadId,
    sequence: record.sequence,
    eventType: record.eventType,
    nodeName: record.nodeName,
    logicalStep: record.logicalStep,
    status: record.status,
    startedAt: record.startedAt ? new Date(record.startedAt) : null,
    completedAt: record.completedAt ? new Date(record.completedAt) : null,
    durationMs: record.durationMs ?? null,
    warningCodes: record.warningCodes,
    evidenceRefs: record.evidenceRefs,
    stateDelta: record.stateDelta ?? null,
  };
}

function fromEventRow(
  row: typeof schema.agenticRunEvents.$inferSelect,
): AgenticRunAuditEventRecord {
  return {
    eventId: row.eventId,
    runId: row.runId,
    threadId: row.threadId,
    sequence: row.sequence,
    eventType: row.eventType as AgenticRunAuditEventRecord["eventType"],
    nodeName: row.nodeName,
    logicalStep: row.logicalStep as AgenticRunAuditEventRecord["logicalStep"],
    status: row.status as AgenticRunAuditEventRecord["status"],
    startedAt: row.startedAt?.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    durationMs: row.durationMs ?? undefined,
    warningCodes: row.warningCodes,
    evidenceRefs: row.evidenceRefs,
    stateDelta: row.stateDelta as AgenticRunAuditEventRecord["stateDelta"],
  };
}

function toToolCallRow(record: AgenticToolCallAuditRecord) {
  return {
    toolCallId: record.toolCallId,
    eventId: record.eventId,
    runId: record.runId,
    threadId: record.threadId,
    sequence: record.sequence,
    toolName: record.toolName,
    status: record.status,
    capabilityId: record.capabilityId,
    serverId: record.serverId,
    startedAt: record.startedAt ? new Date(record.startedAt) : null,
    completedAt: record.completedAt ? new Date(record.completedAt) : null,
    durationMs: record.durationMs ?? null,
    warningCodes: record.warningCodes,
    evidenceRefs: record.evidenceRefs,
    input: record.input ?? null,
    output: record.output ?? null,
    errorMessage: record.errorMessage,
  };
}

function fromToolCallRow(
  row: typeof schema.agenticToolCallAudits.$inferSelect,
): AgenticToolCallAuditRecord {
  return {
    toolCallId: row.toolCallId,
    eventId: row.eventId,
    runId: row.runId,
    threadId: row.threadId,
    sequence: row.sequence,
    toolName: row.toolName,
    status: row.status as AgenticToolCallAuditRecord["status"],
    capabilityId: row.capabilityId ?? undefined,
    serverId: row.serverId ?? undefined,
    startedAt: row.startedAt?.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    durationMs: row.durationMs ?? undefined,
    warningCodes: row.warningCodes,
    evidenceRefs: row.evidenceRefs,
    input: row.input as AgenticToolCallAuditRecord["input"],
    output: row.output as AgenticToolCallAuditRecord["output"],
    errorMessage: row.errorMessage ?? undefined,
  };
}
