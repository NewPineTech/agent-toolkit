import type { CliContext } from "../context.js";
import { writeLine } from "../context.js";

const currentCommands = [
  "workspace create",
  "workspace list",
  "workspace get",
  "workspace update",
  "workspace delete",
  "workspace rotate-api-key",
  "workspace set-domains",
  "workspace set-rate-limit",
  "workspace set-auth",
  "widget snippet",
  "widget iframe",
  "widget script",
  "widget preview",
  "widget test",
  "chat ask",
  "chat session create",
  "usage report",
  "usage daily",
  "usage export",
  "sessions list",
  "sessions get",
  "sessions expire",
  "ingest run",
  "ingest inventory",
  "ingest ocr-sop",
  "ingest form-cards",
  "ingest md-to-pdf",
  "ingest kb create",
  "ingest upload",
  "ingest test",
  "config validate",
  "provider test",
  "domain test",
];

const recommendedCommands = [
  "workspace import/export",
  "widget theme validate",
  "usage anomalies",
  "sessions purge-expired",
  "ingest status",
  "provider rotate-secret-check",
];

export function runFeatures(context: CliContext) {
  writeLine(context, "Current end-user CLI features:");
  for (const command of currentCommands) writeLine(context, `  - ${command}`);
  writeLine(context);
  writeLine(context, "Next CLI-friendly product features:");
  for (const command of recommendedCommands)
    writeLine(context, `  - ${command}`);
}
