import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { TuiApp } from "./app.js";

describe("TuiApp", () => {
  it("renders a grouped feature picker before command details", () => {
    const { lastFrame } = render(<TuiApp />);

    expect(lastFrame()).toContain("Agent Toolkit");
    expect(lastFrame()).toContain("Workspace");
    expect(lastFrame()).toContain("Widget");
    expect(lastFrame()).toContain("Manage customer workspaces");
    expect(lastFrame()).not.toContain("workspace create");
    expect(lastFrame()).not.toContain("widget iframe");
  });

  it("selects list items with Enter", async () => {
    const { lastFrame, stdin } = render(<TuiApp />);

    stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(lastFrame()).toContain("Workspace");
    expect(lastFrame()).toContain("Create or update a workspace");
    expect(lastFrame()).toContain("List workspaces");
    expect(lastFrame()).toContain("Back to feature groups");
  });

  it("uses single-key arrow navigation for list actions", async () => {
    const { lastFrame, stdin } = render(<TuiApp />);

    stdin.write("j");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("\u001b[C");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lastFrame()).toContain("Workspace");
    expect(lastFrame()).toContain("Create or update a workspace");

    stdin.write("\u001b[D");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("\u001b[B");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("\u001b[C");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lastFrame()).toContain("Widget");
    expect(lastFrame()).toContain("Generate embeds");
  });

  it("keeps form values while switching fields and allows updates before review", async () => {
    const command = {
      id: "test.form",
      path: ["test", "form"],
      group: "test",
      title: "Test Form",
      description: "Test Form",
      args: [
        { name: "name", label: "Name", required: true },
        { name: "note", label: "Note" },
        { name: "tag", label: "Tag" },
      ],
      options: [],
      runner: () => undefined,
    };
    const { lastFrame, stdin } = render(<TuiApp commands={[command]} />);

    stdin.write("\u001b[C");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("\u001b[C");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("first");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("\u001b[B");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("memo");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("\u001b[A");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(lastFrame()).toContain("Name");
    expect(lastFrame()).toContain("first");

    stdin.write("\u007f\u007f\u007f\u007f\u007fsecond");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("\u001b[B");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(lastFrame()).toContain("Note");
    expect(lastFrame()).toContain("memo");

    stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(lastFrame()).toContain("Name: second");
    expect(lastFrame()).toContain("Note: memo");
    expect(lastFrame()).toContain("Tag: (not set)");
    expect(lastFrame()).not.toContain("first");
  });

  it("exits form entry to the parent command list", async () => {
    const command = {
      id: "test.form",
      path: ["test", "form"],
      group: "test",
      title: "Test Form",
      description: "Test Form",
      args: [{ name: "name", label: "Name", required: true }],
      options: [],
      runner: () => undefined,
    };
    const { lastFrame, stdin } = render(<TuiApp commands={[command]} />);

    stdin.write("\u001b[C");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("\u001b[C");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("draft");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("\u001b");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(lastFrame()).toContain("Test");
    expect(lastFrame()).toContain("Test Form");
    expect(lastFrame()).not.toContain("draft");
  });

  it("shows result actions with retry first and back navigation", async () => {
    const command = {
      id: "test.done",
      path: ["test", "done"],
      group: "test",
      title: "Test Done",
      description: "Test Done",
      args: [],
      options: [],
      runner: (context: { stdout(message: string): void }) => {
        context.stdout("done\n");
      },
    };
    const { lastFrame, stdin } = render(<TuiApp commands={[command]} />);

    stdin.write("\u001b[C");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("\u001b[C");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("\u001b[C");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(lastFrame()).toContain("done");
    expect(lastFrame()).toContain("Run another command");
    expect(lastFrame()).toContain("Run same command again");
    expect(lastFrame()).toMatch(
      /1\. Run same command again[\s\S]*2\. Run another command/,
    );
    expect(lastFrame()).not.toContain("Exit");
    expect(lastFrame()).not.toContain("Restart the TUI");
    expect(lastFrame()).toContain("← back");

    stdin.write("\u001b[D");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(lastFrame()).toContain("Back to feature groups");
    expect(lastFrame()).toContain("done - Test Done");
    expect(lastFrame()).not.toContain("Run same command again");
  });

  it("can run another command from the result actions", async () => {
    const command = {
      id: "test.done",
      path: ["test", "done"],
      group: "test",
      title: "Test Done",
      description: "Test Done",
      args: [],
      options: [],
      runner: (context: { stdout(message: string): void }) => {
        context.stdout("done\n");
      },
    };
    const { lastFrame, stdin } = render(<TuiApp commands={[command]} />);

    stdin.write("\u001b[C");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("\u001b[C");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("\u001b[C");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("\u001b[B");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(lastFrame()).toContain("Agent Toolkit");
    expect(lastFrame()).toContain("Test - 1 commands");
    expect(lastFrame()).not.toContain("Command result");
  });

  it("redacts secret values in the run confirmation", async () => {
    const command = {
      id: "test.secret",
      path: ["test", "secret"],
      group: "test",
      title: "Test Secret",
      description: "Test Secret",
      args: [],
      options: [
        {
          name: "apiKey",
          label: "API Key",
          required: true,
          secret: true,
          type: "password" as const,
        },
      ],
      runner: () => undefined,
    };
    const { lastFrame, stdin } = render(<TuiApp commands={[command]} />);

    stdin.write("\u001b[C");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("\u001b[C");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("super-secret\r");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(lastFrame()).toContain("API Key: [hidden]");
    expect(lastFrame()).not.toContain("super-secret");
  });
});
