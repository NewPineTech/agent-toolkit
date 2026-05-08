import { describe, expect, it } from "vitest";
import { createCliProgram } from "../cli.js";
import { getTuiMenuItems, moveSelection } from "./navigation.js";

describe("TUI navigation", () => {
  it("builds menu items from the CLI top-level command registry", () => {
    const program = createCliProgram();
    const registeredCommands = program.commands
      .map((command) => command.name())
      .filter((name) => name !== "tui");

    expect(getTuiMenuItems(program).map((item) => item.command)).toEqual(
      registeredCommands,
    );
  });

  it("moves selection through menu items with wrapping", () => {
    expect(moveSelection(0, 1, 3)).toBe(1);
    expect(moveSelection(2, 1, 3)).toBe(0);
    expect(moveSelection(0, -1, 3)).toBe(2);
    expect(moveSelection(0, 1, 0)).toBe(0);
  });
});
