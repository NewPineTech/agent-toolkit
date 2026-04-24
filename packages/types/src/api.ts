import type { ErrorCode } from './enums.js';

export interface SessionRequest {
  workspaceId: string;
}

export interface AuthenticatedSessionRequest extends SessionRequest {
  token: string;
}

export interface SessionResponse {
  token: string;
  sessionId: string;
  expiresAt: string;
}

export interface ChatRequest {
  message: string;
  sessionId: string;
}

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    requestId?: string;
  };
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  components: Record<string, ComponentHealth>;
}

export interface ComponentHealth {
  status: 'healthy' | 'unhealthy';
  latencyMs?: number;
  message?: string;
}

export interface UsageResponse {
  workspaceId: string;
  period: { from: string; to: string };
  totalMessages: number;
  totalTokens: number;
  daily: Array<{
    date: string;
    messageCount: number;
    tokenCount: number;
  }>;
}
