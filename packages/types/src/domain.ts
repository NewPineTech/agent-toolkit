import type { AuthMode, ProviderType } from "./enums.js";

export interface Workspace {
  id: string;
  providerType: ProviderType;
  providerAgentId: string;
  providerApiKey: string;
  providerBaseUrl: string;
  allowedDomains: string[];
  authMode: AuthMode;
  authSecret: string | null;
  rateLimitConfig: RateLimitConfig;
  maxMessageLength: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface Session {
  id: string;
  workspaceId: string;
  providerSessionId: string | null;
  userId: string | null;
  userFingerprint: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
}

export interface UsageRecord {
  workspaceId: string;
  date: string;
  messageCount: number;
  tokenCount: number;
}
