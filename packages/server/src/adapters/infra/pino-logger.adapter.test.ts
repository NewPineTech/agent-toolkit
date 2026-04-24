import { describe, it, expect, vi } from 'vitest';
import { PinoLoggerAdapter } from './pino-logger.adapter.js';

function createMockPino() {
  const mock: any = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  mock.child.mockReturnValue(mock);
  return mock;
}

describe('PinoLoggerAdapter', () => {
  it('delegates info() calls', () => {
    const pino = createMockPino();
    const logger = new PinoLoggerAdapter(pino);
    logger.info('hello', { key: 'val' });
    expect(pino.info).toHaveBeenCalledWith({ key: 'val' }, 'hello');
  });

  it('delegates warn() calls', () => {
    const pino = createMockPino();
    const logger = new PinoLoggerAdapter(pino);
    logger.warn('warning');
    expect(pino.warn).toHaveBeenCalledWith({}, 'warning');
  });

  it('delegates error() calls', () => {
    const pino = createMockPino();
    const logger = new PinoLoggerAdapter(pino);
    logger.error('err', { code: 500 });
    expect(pino.error).toHaveBeenCalledWith({ code: 500 }, 'err');
  });

  it('delegates debug() calls', () => {
    const pino = createMockPino();
    const logger = new PinoLoggerAdapter(pino);
    logger.debug('dbg');
    expect(pino.debug).toHaveBeenCalledWith({}, 'dbg');
  });

  it('child() returns a new PinoLoggerAdapter', () => {
    const pino = createMockPino();
    const logger = new PinoLoggerAdapter(pino);
    const child = logger.child({ requestId: 'req_1' });

    expect(pino.child).toHaveBeenCalledWith({ requestId: 'req_1' });
    expect(child).toBeInstanceOf(PinoLoggerAdapter);
  });

  it('passes empty object when no context given', () => {
    const pino = createMockPino();
    const logger = new PinoLoggerAdapter(pino);
    logger.info('no context');
    expect(pino.info).toHaveBeenCalledWith({}, 'no context');
  });
});
