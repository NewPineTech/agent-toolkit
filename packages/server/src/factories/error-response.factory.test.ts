import { describe, it, expect, vi } from 'vitest';
import { ErrorResponseFactory, AppError } from './error-response.factory.js';
import { ErrorCode } from '@agent-toolkit/types';
import type { Logger } from '../interfaces/logger.interface.js';

const mockLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

describe('ErrorResponseFactory', () => {
  const factory = new ErrorResponseFactory(mockLogger);

  it('maps AppError to correct status and body', () => {
    const error = AppError.invalidWorkspace();
    const { statusCode, body } = factory.create(error, 'req_1');

    expect(statusCode).toBe(404);
    expect(body.error.code).toBe(ErrorCode.INVALID_WORKSPACE);
    expect(body.error.message).toBe('Workspace not found');
    expect(body.error.requestId).toBe('req_1');
  });

  it('returns 500 for unknown errors and logs them', () => {
    const { statusCode, body } = factory.create(
      new Error('unexpected'),
      'req_2',
    );

    expect(statusCode).toBe(500);
    expect(body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(body.error.message).toBe('An internal error occurred');
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('handles non-Error objects', () => {
    const { statusCode, body } = factory.create('string error');

    expect(statusCode).toBe(500);
    expect(body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
  });

  it('includes requestId when provided', () => {
    const { body } = factory.create(new Error('x'), 'req_abc');
    expect(body.error.requestId).toBe('req_abc');
  });
});

describe('AppError', () => {
  it.each([
    ['invalidWorkspace', 404, ErrorCode.INVALID_WORKSPACE],
    ['domainNotAllowed', 403, ErrorCode.DOMAIN_NOT_ALLOWED],
    ['invalidToken', 401, ErrorCode.INVALID_TOKEN],
    ['sessionNotFound', 404, ErrorCode.SESSION_NOT_FOUND],
    ['sessionExpired', 401, ErrorCode.SESSION_EXPIRED],
    ['providerError', 502, ErrorCode.PROVIDER_ERROR],
    ['invalidAuth', 401, ErrorCode.INVALID_AUTH],
  ] as const)(
    '%s returns status %i with code %s',
    (method, expectedStatus, expectedCode) => {
      const err = (AppError as any)[method]();
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(expectedStatus);
      expect(err.code).toBe(expectedCode);
    },
  );

  it('rateLimited includes retryAfter', () => {
    const err = AppError.rateLimited(30) as AppError & { retryAfter?: number };
    expect(err.statusCode).toBe(429);
    expect(err.retryAfter).toBe(30);
  });

  it('messageTooLong includes max length in message', () => {
    const err = AppError.messageTooLong(4000);
    expect(err.message).toContain('4000');
    expect(err.statusCode).toBe(400);
  });

  it('validationError uses custom message', () => {
    const err = AppError.validationError('field is required');
    expect(err.message).toBe('field is required');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
  });
});
