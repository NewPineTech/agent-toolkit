export const ProviderType = {
  RAGFLOW: "ragflow",
  DIFY: "dify",
  LANGFLOW: "langflow",
} as const;

export type ProviderType = (typeof ProviderType)[keyof typeof ProviderType];

export const AuthMode = {
  ANONYMOUS: "anonymous",
  AUTHENTICATED: "authenticated",
  BOTH: "both",
} as const;

export type AuthMode = (typeof AuthMode)[keyof typeof AuthMode];

export const SessionStatus = {
  ACTIVE: "active",
  EXPIRED: "expired",
} as const;

export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export const ErrorCode = {
  INVALID_WORKSPACE: "INVALID_WORKSPACE",
  DOMAIN_NOT_ALLOWED: "DOMAIN_NOT_ALLOWED",
  INVALID_TOKEN: "INVALID_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  RATE_LIMITED: "RATE_LIMITED",
  MESSAGE_TOO_LONG: "MESSAGE_TOO_LONG",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  STREAM_ERROR: "STREAM_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  INVALID_AUTH: "INVALID_AUTH",
  VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
