export interface CliContext {
  stdout(message: string): void;
  stderr(message: string): void;
}

export function writeLine(context: CliContext, message = "") {
  context.stdout(`${message}\n`);
}
