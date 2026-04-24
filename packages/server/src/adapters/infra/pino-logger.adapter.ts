import type { Logger, LogContext } from '../../interfaces/logger.interface.js';

interface PinoLike {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
  debug(obj: object, msg: string): void;
  child(bindings: object): PinoLike;
}

export class PinoLoggerAdapter implements Logger {
  constructor(private readonly logger: PinoLike) {}

  info(message: string, context?: LogContext): void {
    this.logger.info(context ?? {}, message);
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(context ?? {}, message);
  }

  error(message: string, context?: LogContext): void {
    this.logger.error(context ?? {}, message);
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(context ?? {}, message);
  }

  child(context: LogContext): Logger {
    return new PinoLoggerAdapter(this.logger.child(context));
  }
}
