import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  primaryKey,
  date,
} from 'drizzle-orm/pg-core';

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  providerType: text('provider_type').notNull().default('ragflow'),
  providerAgentId: text('provider_agent_id').notNull(),
  providerApiKey: text('provider_api_key').notNull(),
  providerBaseUrl: text('provider_base_url').notNull(),
  allowedDomains: text('allowed_domains').array().notNull().default([]),
  authMode: text('auth_mode').notNull().default('anonymous'),
  authSecret: text('auth_secret'),
  rateLimitConfig: jsonb('rate_limit_config')
    .notNull()
    .$type<{ maxRequests: number; windowMs: number }>()
    .default({ maxRequests: 30, windowMs: 60000 }),
  maxMessageLength: integer('max_message_length').notNull().default(4000),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    providerSessionId: text('provider_session_id'),
    userId: text('user_id'),
    userFingerprint: text('user_fingerprint'),
    metadata: jsonb('metadata')
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('sessions_workspace_id_idx').on(table.workspaceId),
    index('sessions_workspace_fingerprint_idx').on(
      table.workspaceId,
      table.userFingerprint,
    ),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export const usage = pgTable(
  'usage',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    messageCount: integer('message_count').notNull().default(0),
    tokenCount: integer('token_count').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.date] }),
    index('usage_workspace_date_idx').on(table.workspaceId, table.date),
  ],
);
