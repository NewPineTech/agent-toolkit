import type { CliContext } from "../context.js";
import { writeLine } from "../context.js";
import {
  createPool,
  encryptSecret,
  findWorkspace,
  listWorkspaceSummaries,
  parseDomains,
  parsePositiveInteger,
  type WorkspaceRow,
} from "../db.js";
import { addUpdateField, requiredOption, withPool } from "./shared.js";

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

export async function runWorkspaceCreate(
  context: CliContext,
  options: WorkspaceOptions,
) {
  await withPool(createPool, async (pool) => {
    const maxRequests = parsePositiveInteger(options.maxRequests, 30)!;
    const windowMs = parsePositiveInteger(options.windowMs, 60000)!;
    const maxMessageLength = parsePositiveInteger(
      options.maxMessageLength,
      4000,
    )!;
    const encryptedApiKey = encryptSecret(
      requiredOption(options.apiKey, "apiKey"),
    );
    const encryptedAuthSecret = options.authSecret
      ? encryptSecret(options.authSecret)
      : null;
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
        requiredOption(options.id, "id"),
        options.providerType ?? "ragflow",
        requiredOption(options.agentId, "agentId"),
        encryptedApiKey,
        requiredOption(options.baseUrl, "baseUrl"),
        parseDomains(options.domains),
        options.authMode ?? "anonymous",
        encryptedAuthSecret,
        JSON.stringify({ maxRequests, windowMs }),
        maxMessageLength,
      ],
    );
    writeLine(context, `Workspace "${options.id}" saved.`);
  });
}

export async function runWorkspaceList(context: CliContext) {
  await withPool(createPool, async (pool) => {
    const rows = await listWorkspaceSummaries(pool);
    if (rows.length === 0) {
      writeLine(context, "No workspaces found.");
      return;
    }
    for (const row of rows) {
      writeLine(
        context,
        `${row.id}\t${row.provider_type}\t${row.auth_mode}\t${formatDate(row.created_at)}`,
      );
    }
  });
}

export async function runWorkspaceGet(
  context: CliContext,
  workspaceId: string,
) {
  await withPool(createPool, async (pool) => {
    const workspace = await findWorkspace(pool, workspaceId);
    if (!workspace) throw new Error(`Workspace "${workspaceId}" not found`);
    writeLine(context, JSON.stringify(redactWorkspace(workspace), null, 2));
  });
}

export async function runWorkspaceUpdate(
  context: CliContext,
  workspaceId: string,
  options: WorkspaceOptions,
) {
  await withPool(createPool, async (pool) => {
    const fields: string[] = [];
    const values: unknown[] = [];
    addUpdateField(fields, values, "provider_type", options.providerType);
    addUpdateField(fields, values, "provider_agent_id", options.agentId);
    addUpdateField(
      fields,
      values,
      "provider_api_key",
      options.apiKey ? encryptSecret(options.apiKey) : undefined,
    );
    addUpdateField(fields, values, "provider_base_url", options.baseUrl);
    addUpdateField(
      fields,
      values,
      "allowed_domains",
      options.domains == null ? undefined : parseDomains(options.domains),
    );
    addUpdateField(fields, values, "auth_mode", options.authMode);
    addUpdateField(
      fields,
      values,
      "auth_secret",
      options.authSecret ? encryptSecret(options.authSecret) : undefined,
    );
    const maxRequests = parsePositiveInteger(options.maxRequests);
    const windowMs = parsePositiveInteger(options.windowMs);
    if (maxRequests || windowMs) {
      const existing = await findWorkspace(pool, workspaceId);
      if (!existing) throw new Error(`Workspace "${workspaceId}" not found`);
      addUpdateField(
        fields,
        values,
        "rate_limit_config",
        JSON.stringify({
          maxRequests: maxRequests ?? existing.rate_limit_config.maxRequests,
          windowMs: windowMs ?? existing.rate_limit_config.windowMs,
        }),
      );
    }
    addUpdateField(
      fields,
      values,
      "max_message_length",
      parsePositiveInteger(options.maxMessageLength),
    );
    if (fields.length === 0) throw new Error("No update fields provided");
    values.push(workspaceId);
    const result = await pool.query(
      `update workspaces set ${fields.join(", ")}, updated_at = now() where id = $${values.length}`,
      values,
    );
    if (result.rowCount === 0)
      throw new Error(`Workspace "${workspaceId}" not found`);
    writeLine(context, `Workspace "${workspaceId}" updated.`);
  });
}

export async function runWorkspaceDelete(
  context: CliContext,
  workspaceId: string,
) {
  await withPool(createPool, async (pool) => {
    const result = await pool.query("delete from workspaces where id = $1", [
      workspaceId,
    ]);
    if (result.rowCount === 0)
      throw new Error(`Workspace "${workspaceId}" not found`);
    writeLine(context, `Workspace "${workspaceId}" deleted.`);
  });
}

export function runWorkspaceRotateApiKey(
  context: CliContext,
  workspaceId: string,
  options: WorkspaceOptions,
) {
  return runWorkspaceUpdate(context, workspaceId, {
    apiKey: requiredOption(options.apiKey, "apiKey"),
  });
}

export function runWorkspaceSetDomains(
  context: CliContext,
  workspaceId: string,
  options: WorkspaceOptions,
) {
  return runWorkspaceUpdate(context, workspaceId, {
    domains: requiredOption(options.domains, "domains"),
  });
}

export function runWorkspaceSetRateLimit(
  context: CliContext,
  workspaceId: string,
  options: WorkspaceOptions,
) {
  return runWorkspaceUpdate(context, workspaceId, {
    maxRequests: requiredOption(options.maxRequests, "maxRequests"),
    windowMs: requiredOption(options.windowMs, "windowMs"),
  });
}

export function runWorkspaceSetAuth(
  context: CliContext,
  workspaceId: string,
  options: WorkspaceOptions,
) {
  return runWorkspaceUpdate(context, workspaceId, {
    authMode: requiredOption(options.authMode, "authMode"),
    authSecret: options.authSecret,
  });
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
