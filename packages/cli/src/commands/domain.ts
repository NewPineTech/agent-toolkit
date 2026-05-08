import { AllowlistDomainValidator } from "@agent-toolkit/core";
import type { CliContext } from "../context.js";
import { writeLine } from "../context.js";
import { createPool, findWorkspace } from "../db.js";
import { withPool } from "./shared.js";

const domainValidator = new AllowlistDomainValidator();

export async function runDomainTest(
  context: CliContext,
  workspaceId: string,
  options: { origin: string },
) {
  await withPool(createPool, async (pool) => {
    const workspace = await findWorkspace(pool, workspaceId);
    if (!workspace) throw new Error(`Workspace "${workspaceId}" not found`);
    const allowed = domainValidator.validate(
      options.origin,
      workspace.allowed_domains,
    );
    writeLine(context, `${options.origin}: ${allowed ? "allowed" : "blocked"}`);
    if (!allowed) process.exitCode = 1;
  });
}
