import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  primaryKey,
  date,
} from "drizzle-orm/pg-core";

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  providerType: text("provider_type").notNull().default("ragflow"),
  providerAgentId: text("provider_agent_id").notNull(),
  providerApiKey: text("provider_api_key").notNull(),
  providerBaseUrl: text("provider_base_url").notNull(),
  allowedDomains: text("allowed_domains").array().notNull().default([]),
  authMode: text("auth_mode").notNull().default("anonymous"),
  authSecret: text("auth_secret"),
  rateLimitConfig: jsonb("rate_limit_config")
    .notNull()
    .$type<{ maxRequests: number; windowMs: number }>()
    .default({ maxRequests: 30, windowMs: 60000 }),
  maxMessageLength: integer("max_message_length").notNull().default(4000),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    providerSessionId: text("provider_session_id"),
    userId: text("user_id"),
    userFingerprint: text("user_fingerprint"),
    metadata: jsonb("metadata")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("sessions_workspace_id_idx").on(table.workspaceId),
    index("sessions_workspace_fingerprint_idx").on(
      table.workspaceId,
      table.userFingerprint,
    ),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const usage = pgTable(
  "usage",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    messageCount: integer("message_count").notNull().default(0),
    tokenCount: integer("token_count").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.date] }),
    index("usage_workspace_date_idx").on(table.workspaceId, table.date),
  ],
);

export const agenticRunAudits = pgTable(
  "agentic_run_audits",
  {
    runId: text("run_id").primaryKey(),
    threadId: text("thread_id").notNull(),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    selectedIntents: text("selected_intents").array().notNull().default([]),
    warningCodes: text("warning_codes").array().notNull().default([]),
    evidenceRefs: text("evidence_refs").array().notNull().default([]),
    stateDelta: jsonb("state_delta"),
    retainedUntil: timestamp("retained_until", {
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    index("agentic_run_audits_thread_started_idx").on(
      table.threadId,
      table.startedAt,
    ),
    index("agentic_run_audits_workspace_started_idx").on(
      table.workspaceId,
      table.startedAt,
    ),
    index("agentic_run_audits_status_idx").on(table.status),
    index("agentic_run_audits_retained_until_idx").on(table.retainedUntil),
  ],
);

export const agenticRunEvents = pgTable(
  "agentic_run_events",
  {
    eventId: text("event_id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => agenticRunAudits.runId, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    sequence: integer("sequence").notNull(),
    eventType: text("event_type").notNull(),
    nodeName: text("node_name").notNull(),
    logicalStep: text("logical_step"),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    warningCodes: text("warning_codes").array().notNull().default([]),
    evidenceRefs: text("evidence_refs").array().notNull().default([]),
    stateDelta: jsonb("state_delta"),
  },
  (table) => [
    index("agentic_run_events_run_sequence_idx").on(
      table.runId,
      table.sequence,
    ),
    index("agentic_run_events_thread_sequence_idx").on(
      table.threadId,
      table.sequence,
    ),
  ],
);

export const agenticToolCallAudits = pgTable(
  "agentic_tool_call_audits",
  {
    toolCallId: text("tool_call_id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => agenticRunEvents.eventId, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => agenticRunAudits.runId, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    sequence: integer("sequence").notNull(),
    toolName: text("tool_name").notNull(),
    status: text("status").notNull(),
    capabilityId: text("capability_id"),
    serverId: text("server_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    warningCodes: text("warning_codes").array().notNull().default([]),
    evidenceRefs: text("evidence_refs").array().notNull().default([]),
    input: jsonb("input"),
    output: jsonb("output"),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("agentic_tool_call_audits_run_sequence_idx").on(
      table.runId,
      table.sequence,
    ),
    index("agentic_tool_call_audits_capability_idx").on(table.capabilityId),
  ],
);
