import type { CliContext } from "../context.js";
import { writeLine } from "../context.js";

export function runConfigValidate(context: CliContext) {
  const checks = [
    ["DATABASE_URL", Boolean(process.env["DATABASE_URL"])],
    [
      "ENCRYPTION_KEY",
      /^[a-fA-F0-9]{64}$/.test(process.env["ENCRYPTION_KEY"] ?? ""),
    ],
  ] as const;
  let ok = true;
  for (const [name, passed] of checks) {
    writeLine(context, `${name}: ${passed ? "ok" : "missing/invalid"}`);
    ok = ok && passed;
  }
  if (!ok) process.exitCode = 1;
}
