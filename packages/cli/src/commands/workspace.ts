import type { CliContext } from "../context.js";
import { writeLine } from "../context.js";
import {
  createPool,
  encryptSecret,
  findWorkspace,
  parseDomains,
  parsePositiveInteger,
  type WorkspaceRow,
} from "../db.js";

interface WorkspaceOptions {
  id?: string;
  providerType?: string;
  agentId?: string;
  apiKey?: string;
  baseUrl?: string;
  domains?: string;
  authMode?: string;
  authSecret?: string;
  maxRequests?: string;
  windowMs?: string;
  maxMessageLength?: string;
}

export async function runWorkspaceCreate(context: CliContext, options: WorkspaceOptions) {
  const pool = createPool();
  try {
    const maxRequests = parsePositiveInteger(options.maxRequests, 30)!;
    const windowMs = parsePositiveInteger(options.windowMs, 60000)!;
    const maxMessageLength = parsePositiveInteger(options.maxMessageLength, 4000)!;
    const encryptedApiKey = encryptSecret(required(options.apiKey, "apiKey"));
    const encryptedAuthSecret = options.authSecret ? encryptSecret(options.authSecret) : null;
    await pool.query(
      `insert into workspaces (
        id, provider_type, provider_agent_id, provider_api_key, provider_base_url,
        allowed_domains, auth_mode, auth_secret, rate_limit_config, max_message_length, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
      on conflict (id) do update set
        provider_type = excluded.provider_type,
        provider_agent_id = excluded.provider_agent_id,
        provider_api_key = excluded.provider_api_key,
        provider_base_url = excluded.provider_base_url,
        allowed_domains = excluded.allowed_domains,
        auth_mode = excluded.auth_mode,
        auth_secret = excluded.auth_secret,
        rate_limit_config = excluded.rate_limit_config,
        max_message_length = excluded.max_message_length,
        updated_at = now()`,
      [
        required(options.id, "id"),
        options.providerType ?? "ragflow",
        required(options.agentId, "agentId"),
        encryptedApiKey,
        required(options.baseUrl, "baseUrl"),
        parseDomains(options.domains),
        options.authMode ?? "anonymous",
        encryptedAuthSecret,
        JSON.stringify({ maxRequests, windowMs }),
        maxMessageLength,
      ],
    );
    writeLine(context, `Workspace "${options.id}" saved.`);
  } finally {
    await pool.end();
  }
}

export async function runWorkspaceList(context: CliContext) {
  const pool = createPool();
  try {
    const result = await pool.query<Pick<WorkspaceRow, "id" | "provider_type" | "auth_mode" | "created_at">>(
      "select id, provider_type, auth_mode, created_at from workspaces order by created_at desc",
    );
    if (result.rows.length === 0) {
      writeLine(context, "No workspaces found.");
      return;
    }
    for (const row of result.rows) {
      writeLine(context, `${row.id}\t${row.provider_type}\t${row.auth_mode}\t${formatDate(row.created_at)}`);
    }
  } finally {
    await pool.end();
  }
}

export async function runWorkspaceGet(context: CliContext, workspaceId: string) {
  const pool = createPool();
  try {
    const workspace = await findWorkspace(pool, workspaceId);
    if (!workspace) throw new Error(`Workspace "${workspaceId}" not found`);
    writeLine(context, JSON.stringify(redactWorkspace(workspace), null, 2));
  } finally {
    await pool.end();
  }
}

export async function runWorkspaceUpdate(context: CliContext, workspaceId: string, options: WorkspaceOptions) {
  const pool = createPool();
  try {
    const fields: string[] = [];
    const values: unknown[] = [];
    addField(fields, values, "provider_type", options.providerType);
    addField(fields, values, "provider_agent_id", options.agentId);
    addField(fields, values, "provider_api_key", options.apiKey ? encryptSecret(options.apiKey) : undefined);
    addField(fields, values, "provider_base_url", options.baseUrl);
    addField(fields, values, "allowed_domains", options.domains == null ? undefined : parseDomains(options.domains));
    addField(fields, values, "auth_mode", options.authMode);
    addField(fields, values, "auth_secret", options.authSecret ? encryptSecret(options.authSecret) : undefined);
    const maxRequests = parsePositiveInteger(options.maxRequests);
    const windowMs = parsePositiveInteger(options.windowMs);
    if (maxRequests || windowMs) {
      const existing = await findWorkspace(pool, workspaceId);
      if (!existing) throw new Error(`Workspace "${workspaceId}" not found`);
      addField(fields, values, "rate_limit_config", JSON.stringify({
        maxRequests: maxRequests ?? existing.rate_limit_config.maxRequests,
        windowMs: windowMs ?? existing.rate_limit_config.windowMs,
      }));
    }
    addField(fields, values, "max_message_length", parsePositiveInteger(options.maxMessageLength));
    if (fields.length === 0) throw new Error("No update fields provided");
    values.push(workspaceId);
    const result = await pool.query(
      `update workspaces set ${fields.join(", ")}, updated_at = now() where id = $${values.length}`,
      values,
    );
    if (result.rowCount === 0) throw new Error(`Workspace "${workspaceId}" not found`);
    writeLine(context, `Workspace "${workspaceId}" updated.`);
  } finally {
    await pool.end();
  }
}

export async function runWorkspaceDelete(context: CliContext, workspaceId: string) {
  const pool = createPool();
  try {
    const result = await pool.query("delete from workspaces where id = $1", [workspaceId]);
    if (result.rowCount === 0) throw new Error(`Workspace "${workspaceId}" not found`);
    writeLine(context, `Workspace "${workspaceId}" deleted.`);
  } finally {
    await pool.end();
  }
}

export function runWorkspaceRotateApiKey(context: CliContext, workspaceId: string, options: WorkspaceOptions) {
  return runWorkspaceUpdate(context, workspaceId, { apiKey: required(options.apiKey, "apiKey") });
}

export function runWorkspaceSetDomains(context: CliContext, workspaceId: string, options: WorkspaceOptions) {
  return runWorkspaceUpdate(context, workspaceId, { domains: required(options.domains, "domains") });
}

export function runWorkspaceSetRateLimit(context: CliContext, workspaceId: string, options: WorkspaceOptions) {
  return runWorkspaceUpdate(context, workspaceId, {
    maxRequests: required(options.maxRequests, "maxRequests"),
    windowMs: required(options.windowMs, "windowMs"),
  });
}

export function runWorkspaceSetAuth(context: CliContext, workspaceId: string, options: WorkspaceOptions) {
  return runWorkspaceUpdate(context, workspaceId, {
    authMode: required(options.authMode, "authMode"),
    authSecret: options.authSecret,
  });
}

function addField(fields: string[], values: unknown[], column: string, value: unknown) {
  if (value === undefined) return;
  values.push(value);
  fields.push(`${column} = $${values.length}`);
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function redactWorkspace(workspace: WorkspaceRow) {
  return {
    ...workspace,
    provider_api_key: "[encrypted]",
    auth_secret: workspace.auth_secret ? "[encrypted]" : null,
  };
}

function formatDate(value: Date) {
  return new Date(value).toISOString();
}
