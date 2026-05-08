import {
  AesEncryptionService,
  parseDomains,
  parsePositiveInteger,
} from "@agent-toolkit/core";
import pg from "pg";

const { Pool } = pg;

export interface WorkspaceRow {
  id: string;
  provider_type: string;
  provider_agent_id: string;
  provider_api_key: string;
  provider_base_url: string;
  allowed_domains: string[];
  auth_mode: string;
  auth_secret: string | null;
  rate_limit_config: { maxRequests: number; windowMs: number };
  max_message_length: number;
  created_at: Date;
  updated_at: Date;
}

export interface SessionRow {
  id: string;
  workspace_id: string;
  provider_session_id: string | null;
  user_id: string | null;
  user_fingerprint: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  last_active_at: Date;
  expires_at: Date;
}

export function createPool() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for this command");
  }
  return new Pool({ connectionString });
}

export function encryptSecret(plaintext: string): string {
  const encryptionKey = process.env["ENCRYPTION_KEY"];
  if (!encryptionKey) {
    throw new Error(
      "ENCRYPTION_KEY is required for encrypted workspace fields",
    );
  }
  return new AesEncryptionService(encryptionKey).encrypt(plaintext);
}

export { parseDomains, parsePositiveInteger };

export async function findWorkspace(
  pool: pg.Pool,
  workspaceId: string,
): Promise<WorkspaceRow | null> {
  const result = await pool.query<WorkspaceRow>(
    "select * from workspaces where id = $1 limit 1",
    [workspaceId],
  );
  return result.rows[0] ?? null;
}
