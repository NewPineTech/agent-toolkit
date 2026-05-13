import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildIngestArgs,
  getVenvPythonPath,
  resolveSetupPythonCommand,
  resolveToolDir,
} from "../ingest.js";

describe("ingest command helpers", () => {
  it("builds ingest commands with the tool venv python", () => {
    const toolDir = mkdtempSync(join(tmpdir(), "agent-toolkit-ingest-"));
    const venvBin = join(toolDir, ".venv", "bin");
    mkdirSync(venvBin, { recursive: true });
    writeFileSync(join(venvBin, "python"), "");

    expect(buildIngestArgs("inventory", {}, toolDir)[0]).toBe(
      join(venvBin, "python"),
    );
  });

  it("passes root folder overrides to the inventory step", () => {
    const toolDir = mkdtempSync(join(tmpdir(), "agent-toolkit-ingest-"));
    const command = buildIngestArgs(
      "inventory",
      { rootFolderId: "drive-folder-123" },
      toolDir,
    );

    expect(command).toContain("--root-folder-id");
    expect(command).toContain("drive-folder-123");
  });

  it("falls back to python3 for setup when python is unavailable", () => {
    expect(resolveSetupPythonCommand({ PATH: "/opt/homebrew/bin" })).toBe(
      "python3",
    );
  });

  it("resolves the repo ingest tool directory even outside the repo root", () => {
    expect(resolveToolDir("/private/tmp")).toContain(
      "tools/ragflow_kb_generater",
    );
  });

  it("honors AGENT_TOOLKIT_INGEST_DIR when set", () => {
    const toolDir = mkdtempSync(join(tmpdir(), "agent-toolkit-ingest-"));

    expect(
      resolveToolDir("/private/tmp", { AGENT_TOOLKIT_INGEST_DIR: toolDir }),
    ).toBe(toolDir);
  });

  it("resolves POSIX venv python inside the ingest tool directory", () => {
    expect(getVenvPythonPath("/repo/tools/ragflow_kb_generater")).toBe(
      "/repo/tools/ragflow_kb_generater/.venv/bin/python",
    );
  });
});
