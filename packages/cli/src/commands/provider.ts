import type { CliContext } from "../context.js";
import { writeLine } from "../context.js";
import { createPool, findWorkspace } from "../db.js";

export async function runProviderTest(context: CliContext, workspaceId: string) {
  const pool = createPool();
  try {
    const workspace = await findWorkspace(pool, workspaceId);
    if (!workspace) throw new Error(`Workspace "${workspaceId}" not found`);
    const response = await fetch(workspace.provider_base_url, { method: "HEAD" }).catch(() => null);
    if (!response) {
      writeLine(context, `${workspace.provider_base_url}: unreachable`);
      process.exitCode = 1;
      return;
    }
    writeLine(context, `${workspace.provider_base_url}: HTTP ${response.status}`);
    if (response.status >= 500) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
