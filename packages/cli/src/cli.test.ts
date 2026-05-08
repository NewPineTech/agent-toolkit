import { describe, expect, it } from "vitest";
import { createCliProgram } from "./cli.js";

async function runCli(args: string[]) {
  const output: string[] = [];
  const errors: string[] = [];
  let exitCode = 0;

  const program = createCliProgram({
    stdout: (message) => output.push(message),
    stderr: (message) => errors.push(message),
    exitOverride: (code) => {
      exitCode = code;
      throw new Error(`exit:${code}`);
    },
  });

  try {
    await program.parseAsync(["node", "agent-toolkit", ...args], {
      from: "node",
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("exit:")) {
      throw error;
    }
  }

  return {
    exitCode,
    stdout: output.join(""),
    stderr: errors.join(""),
  };
}

describe("agent-toolkit cli", () => {
  it("shows only end-user command groups in help", async () => {
    const result = await runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("tui");
    expect(result.stdout).toContain("workspace");
    expect(result.stdout).toContain("widget");
    expect(result.stdout).toContain("chat");
    expect(result.stdout).toContain("usage");
    expect(result.stdout).toContain("sessions");
    expect(result.stdout).toContain("ingest");
    expect(result.stdout).toContain("tui");
    expect(result.stdout).not.toContain("dev");
    expect(result.stdout).not.toContain("build");
    expect(result.stdout).not.toContain("deploy");
    expect(result.stdout).not.toContain("migrate");
  });

  it("runs the full-screen TUI command", async () => {
    const output: string[] = [];
    const program = createCliProgram({
      stdout: (message) => output.push(message),
      runTui: async (context) => {
        context.stdout("TUI started\n");
      },
    });

    await program.parseAsync(["node", "atk", "tui"], {
      from: "node",
    });

    expect(output.join("")).toBe("TUI started\n");
  });

  it("prints an iframe embed snippet for a workspace", async () => {
    const result = await runCli([
      "widget",
      "iframe",
      "ws_acme",
      "--api-url",
      "https://api.example.com",
      "--title",
      "Acme Assistant",
      "--primary-color",
      "#D4775A",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("<iframe");
    expect(result.stdout).toContain(
      "https://api.example.com/widget/embed?workspaceId=ws_acme",
    );
    expect(result.stdout).toContain('title="Acme Assistant"');
    expect(result.stdout).toContain("primaryColor=%23D4775A");
  });

  it("prints a script-tag embed snippet for a workspace", async () => {
    const result = await runCli([
      "widget",
      "script",
      "ws_acme",
      "--api-url",
      "https://api.example.com",
      "--initial-open",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("<script");
    expect(result.stdout).toContain(
      'src="https://api.example.com/widget/widget.js"',
    );
    expect(result.stdout).toContain('data-workspace-id="ws_acme"');
    expect(result.stdout).toContain('data-initial-open="true"');
  });

  it("maps ingest run test mode to python steps without shell scripts", async () => {
    const result = await runCli(["ingest", "run", "--test", "--dry-run"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("scripts/step1_inventory.py");
    expect(result.stdout).toContain("scripts/step2_ocr_sop.py --limit 5");
    expect(result.stdout).toContain("scripts/step3_form_cards.py --limit 5");
    expect(result.stdout).toContain(
      "scripts/step4_create_kbs.py --skip-existing",
    );
    expect(result.stdout).not.toContain("run_all.sh");
  });

  it("passes root folder overrides through ingest run inventory", async () => {
    const result = await runCli([
      "ingest",
      "run",
      "--root-folder-id",
      "drive-folder-123",
      "--dry-run",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "scripts/step1_inventory.py --root-folder-id drive-folder-123",
    );
  });

  it("documents new user-facing feature commands", async () => {
    const result = await runCli(["features"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("workspace list");
    expect(result.stdout).toContain("usage report");
    expect(result.stdout).toContain("sessions list");
    expect(result.stdout).toContain("provider test");
    expect(result.stdout).toContain("domain test");
    expect(result.stdout).not.toContain("db migrate");
  });
});
