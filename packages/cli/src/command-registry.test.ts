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

  it("marks generated widget output as copyable for interactive UIs", () => {
    const copyableCommands = commandSpecs
      .filter((command) => command.copyableOutput)
      .map((command) => command.id);

    expect(copyableCommands).toEqual([
      "widget.snippet",
      "widget.iframe",
      "widget.script",
      "widget.preview",
    ]);
  });

  it("resolves widget and chat API URLs from the operator Widget API URL default", () => {
    const commandsWithApiUrlDefaults = commandSpecs
      .filter((command) =>
        [...command.args, ...command.options].some(
          (field) => field.name === "apiUrl",
        ),
      )
      .map((command) => [
        command.id,
        [...command.args, ...command.options].find(
          (field) => field.name === "apiUrl",
        )?.defaultSource,
      ]);

    expect(commandsWithApiUrlDefaults).toEqual([
      ["widget.snippet", "operator:WIDGET_API_URL"],
      ["widget.iframe", "operator:WIDGET_API_URL"],
      ["widget.script", "operator:WIDGET_API_URL"],
      ["widget.preview", "operator:WIDGET_API_URL"],
      ["widget.test", "operator:WIDGET_API_URL"],
      ["chat.ask", "operator:WIDGET_API_URL"],
      ["chat.session.create", "operator:WIDGET_API_URL"],
    ]);
  });

  it("marks widget appearance options as advanced details", () => {
    const widgetIframe = commandSpecs.find(
      (command) => command.id === "widget.iframe",
    );

    expect(
      widgetIframe?.options
        .filter((field) => field.advanced)
        .map((field) => field.name),
    ).toEqual([
      "title",
      "subtitle",
      "placeholder",
      "greeting",
      "suggestions",
      "primaryColor",
      "backgroundColor",
      "textColor",
      "position",
      "initialOpen",
    ]);
  });

  it("keeps safe workspace create defaults available for smart review", () => {
    const workspaceCreate = commandSpecs.find(
      (command) => command.id === "workspace.create",
    );

    expect(
      workspaceCreate?.options
        .filter((field) => field.defaultValue !== undefined)
        .map((field) => [field.name, field.defaultValue]),
    ).toEqual([
      ["providerType", "langgraph"],
      ["domains", "*"],
      ["authMode", "anonymous"],
      ["maxRequests", "30"],
      ["windowMs", "60000"],
      ["maxMessageLength", "4000"],
    ]);
    expect(
      workspaceCreate?.options.find((field) => field.name === "id")?.advanced,
    ).toBe(true);
    expect(
      workspaceCreate?.options.find((field) => field.name === "providerType")
        ?.promptFirst,
    ).toBe(true);
    expect(
      workspaceCreate?.options.find((field) => field.name === "apiKey")
        ?.defaultSource,
    ).toBe("operator:LANGGRAPH_API_KEY");
  });
});
