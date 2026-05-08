import { describe, expect, it } from "vitest";
import { commandSpecs } from "./command-registry.js";

describe("command registry", () => {
  it("tracks every end-user command exposed by the CLI", () => {
    expect(commandSpecs.map((command) => command.id)).toEqual([
      "features",
      "workspace.create",
      "workspace.list",
      "workspace.get",
      "workspace.update",
      "workspace.delete",
      "workspace.rotate-api-key",
      "workspace.set-domains",
      "workspace.set-rate-limit",
      "workspace.set-auth",
      "widget.snippet",
      "widget.iframe",
      "widget.script",
      "widget.preview",
      "widget.test",
      "chat.ask",
      "chat.session.create",
      "usage.report",
      "usage.daily",
      "usage.export",
      "sessions.list",
      "sessions.get",
      "sessions.expire",
      "ingest.setup",
      "ingest.run",
      "ingest.inventory",
      "ingest.ocr-sop",
      "ingest.form-cards",
      "ingest.md-to-pdf",
      "ingest.kb.create",
      "ingest.upload",
      "ingest.test",
      "config.validate",
      "provider.test",
      "domain.test",
    ]);
  });

  it("marks secret and destructive fields for interactive UIs", () => {
    const workspaceCreate = commandSpecs.find(
      (command) => command.id === "workspace.create",
    );
    const workspaceDelete = commandSpecs.find(
      (command) => command.id === "workspace.delete",
    );

    expect(
      workspaceCreate?.options.find((option) => option.name === "apiKey")
        ?.secret,
    ).toBe(true);
    expect(workspaceDelete?.destructive).toBe(true);
  });

  it("does not apply create defaults to optional workspace update fields", () => {
    const workspaceUpdate = commandSpecs.find(
      (command) => command.id === "workspace.update",
    );

    expect(workspaceUpdate?.options).toBeDefined();
    expect(
      workspaceUpdate?.options.filter(
        (option) => option.defaultValue !== undefined,
      ),
    ).toEqual([]);
  });
});
