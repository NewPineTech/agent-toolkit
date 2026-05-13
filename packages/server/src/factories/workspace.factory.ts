import type {
  Workspace,
  RateLimitConfig,
  AuthMode,
  ProviderType,
} from "@agent-toolkit/types";
import type { schema } from "../db/index.js";

type WorkspaceRow = typeof schema.workspaces.$inferSelect;

export class WorkspaceFactory {
  fromRow(row: WorkspaceRow): Workspace {
    return {
      id: row.id,
      providerType: row.providerType as ProviderType,
      providerAgentId: row.providerAgentId,
      providerApiKey: row.providerApiKey,
      providerBaseUrl: row.providerBaseUrl,
      providerConfig: row.providerConfig,
      allowedDomains: row.allowedDomains,
      authMode: row.authMode as AuthMode,
      authSecret: row.authSecret,
      rateLimitConfig: row.rateLimitConfig as RateLimitConfig,
      maxMessageLength: row.maxMessageLength,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
