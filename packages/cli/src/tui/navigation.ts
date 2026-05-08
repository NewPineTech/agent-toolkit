import type { Command } from "commander";

export interface TuiMenuItem {
  command: string;
  label: string;
}

export function getTuiMenuItems(program: Command): TuiMenuItem[] {
  return program.commands
    .filter((command) => command.name() !== "tui")
    .map((command) => ({
      command: command.name(),
      label: command.name(),
    }));
}

export function moveSelection(
  currentIndex: number,
  delta: number,
  itemCount: number,
) {
  if (itemCount <= 0) return 0;
  return (currentIndex + delta + itemCount) % itemCount;
}
