import type { CliContext } from "../context.js";
import { writeLine } from "../context.js";
import { createPool, type SessionRow } from "../db.js";

export async function runSessionsList(context: CliContext, workspaceId: string, options: { active?: boolean }) {
  const pool = createPool();
  try {
    const activeClause = options.active ? "and expires_at > now()" : "";
    const result = await pool.query<SessionRow>(
      `select * from sessions where workspace_id = $1 ${activeClause} order by last_active_at desc limit 100`,
      [workspaceId],
    );
    for (const row of result.rows) {
      writeLine(context, `${row.id}\t${row.workspace_id}\t${row.provider_session_id ?? "-"}\t${new Date(row.expires_at).toISOString()}`);
    }
  } finally {
    await pool.end();
  }
}

export async function runSessionGet(context: CliContext, sessionId: string) {
  const pool = createPool();
  try {
    const result = await pool.query<SessionRow>("select * from sessions where id = $1 limit 1", [sessionId]);
    const row = result.rows[0];
    if (!row) throw new Error(`Session "${sessionId}" not found`);
    writeLine(context, JSON.stringify(row, null, 2));
  } finally {
    await pool.end();
  }
}

export async function runSessionExpire(context: CliContext, sessionId: string) {
  const pool = createPool();
  try {
    const result = await pool.query("update sessions set expires_at = now() where id = $1", [sessionId]);
    if (result.rowCount === 0) throw new Error(`Session "${sessionId}" not found`);
    writeLine(context, `Session "${sessionId}" expired.`);
  } finally {
    await pool.end();
  }
}
