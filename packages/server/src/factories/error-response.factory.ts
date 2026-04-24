import { ErrorCode } from '@agent-toolkit/types';
import type { ErrorResponse } from '@agent-toolkit/types';
import type { Logger } from '../interfaces/logger.interface.js';

export class ErrorResponseFactory {
  constructor(private readonly logger: Logger) {}

  create(
    error: unknown,
    requestId?: string,
  ): { statusCode: number; body: ErrorResponse } {
    if (error instanceof AppError) {
      return {
        statusCode: error.statusCode,
        body: {
          error: {
            code: error.code,
            message: error.message,
            requestId,
          },
        },
      };
    }

    this.logger.error('Unhandled error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      requestId,
    });

    return {
      statusCode: 500,
      body: {
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'An internal error occurred',
          requestId,
        },
      },
    };
  }
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static invalidWorkspace(): AppError {
    return new AppError(ErrorCode.INVALID_WORKSPACE, 'Workspace not found', 404);
  }

  static domainNotAllowed(): AppError {
    return new AppError(ErrorCode.DOMAIN_NOT_ALLOWED, 'Origin not allowed', 403);
  }

  static invalidToken(): AppError {
    return new AppError(ErrorCode.INVALID_TOKEN, 'Invalid or expired token', 401);
  }

  static rateLimited(retryAfter?: number): AppError {
    const err = new AppError(ErrorCode.RATE_LIMITED, 'Rate limit exceeded', 429);
    (err as AppError & { retryAfter?: number }).retryAfter = retryAfter;
    return err;
  }

  static messageTooLong(maxLength: number): AppError {
    return new AppError(
      ErrorCode.MESSAGE_TOO_LONG,
      `Message exceeds maximum length of ${maxLength} characters`,
      400,
    );
  }

  static sessionNotFound(): AppError {
    return new AppError(ErrorCode.SESSION_NOT_FOUND, 'Session not found', 404);
  }

  static sessionExpired(): AppError {
    return new AppError(ErrorCode.SESSION_EXPIRED, 'Session has expired', 401);
  }

  static providerError(): AppError {
    return new AppError(ErrorCode.PROVIDER_ERROR, 'Provider error', 502);
  }

  static invalidAuth(): AppError {
    return new AppError(ErrorCode.INVALID_AUTH, 'Invalid authentication', 401);
  }

  static validationError(message: string): AppError {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, 400);
  }
}
