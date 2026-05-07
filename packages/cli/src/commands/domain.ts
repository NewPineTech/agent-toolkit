import type { CliContext } from "../context.js";
import { writeLine } from "../context.js";
import { createPool, findWorkspace } from "../db.js";

export async function runDomainTest(context: CliContext, workspaceId: string, options: { origin: string }) {
  const pool = createPool();
  try {
    const workspace = await findWorkspace(pool, workspaceId);
    if (!workspace) throw new Error(`Workspace "${workspaceId}" not found`);
    const allowed = workspace.allowed_domains.length === 0 ||
      workspace.allowed_domains.includes("*") ||
      workspace.allowed_domains.includes(options.origin);
    writeLine(context, `${options.origin}: ${allowed ? "allowed" : "blocked"}`);
    if (!allowed) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
