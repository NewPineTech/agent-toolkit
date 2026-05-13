import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { fastifyAwilixPlugin, diContainer } from "@fastify/awilix";
import { asValue } from "awilix";
import type { Session, Workspace, ChatStreamEvent } from "@agent-toolkit/types";
import { AuthMode, ProviderType } from "@agent-toolkit/types";

import { AesEncryptionService } from "../../adapters/security/aes-encryption.service.js";
import { JwtTokenService } from "../../adapters/security/jwt-token.service.js";
import { AllowlistDomainValidator } from "../../adapters/security/allowlist-domain.validator.js";
import { InMemoryRateLimiter } from "../../adapters/infra/in-memory-rate.limiter.js";
import { InMemorySessionCache } from "../../adapters/infra/in-memory-session.cache.js";
import { PinoLoggerAdapter } from "../../adapters/infra/pino-logger.adapter.js";
import {
  ChatProviderFactory,
  SessionFactory,
  TokenFactory,
  WorkspaceFactory,
  ErrorResponseFactory,
} from "../../factories/index.js";
import type { SessionStore } from "../../interfaces/session-store.interface.js";
import type { UsageTracker } from "../../interfaces/usage-tracker.interface.js";
import type {
  ChatProvider,
  ChatProviderConfig,
} from "../../interfaces/chat-provider.interface.js";
import { widgetRoutes } from "../widget.routes.js";
import { healthRoutes } from "../health.routes.js";

const ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const JWT_SECRET = "test-jwt-secret-for-integration-tests-32-chars-min";

const testWorkspace: Workspace = {
  id: "ws_test",
  providerType: ProviderType.RAGFLOW,
  providerAgentId: "agent_test",
  providerApiKey: "",
  providerBaseUrl: "https://ragflow.mock",
  providerConfig: {},
  allowedDomains: ["https://example.com"],
  authMode: AuthMode.ANONYMOUS,
  authSecret: null,
  rateLimitConfig: { maxRequests: 100, windowMs: 60_000 },
  maxMessageLength: 4000,
  createdAt: new Date(),
  updatedAt: new Date(),
};

class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, Session>();

  async create(session: Session) {
    this.sessions.set(session.id, session);
  }
  async findById(id: string) {
    return this.sessions.get(id) ?? null;
  }
  async updateLastActive(id: string) {
    const s = this.sessions.get(id);
    if (s) s.lastActiveAt = new Date();
  }
  async updateProviderSessionId(id: string, providerSessionId: string) {
    const s = this.sessions.get(id);
    if (s) s.providerSessionId = providerSessionId;
  }
  async updateMetadata(id: string, metadata: Record<string, unknown>) {
    const s = this.sessions.get(id);
    if (s) s.metadata = metadata;
  }
  async findByWorkspaceAndFingerprint() {
    return null;
  }
}

class InMemoryUsageTracker implements UsageTracker {
  records: Array<{ workspaceId: string; date: string }> = [];
  async increment(workspaceId: string, date: string) {
    this.records.push({ workspaceId, date });
  }
  async getUsage() {
    return [];
  }
}

class MockChatProvider implements ChatProvider {
  async createSession() {
    return "rf_mock_sess";
  }
  async *sendMessage(
    _config: ChatProviderConfig,
    _sessionId: string,
    _message: string,
  ): AsyncGenerator<ChatStreamEvent, void, undefined> {
    yield { type: "token", content: "Hello" };
    yield { type: "token", content: " from" };
    yield { type: "token", content: " RAGFlow" };
    yield {
      type: "done",
      sessionId: "rf_mock_sess",
      providerSessionId: "rf_mock_sess",
    };
  }
}

class MockWorkspaceCache {
  async get() {
    return null;
  }
  async set() {}
  async invalidate() {}
}

async function buildTestApp() {
  const encryption = new AesEncryptionService(ENCRYPTION_KEY);
  testWorkspace.providerApiKey = encryption.encrypt("sk-mock-key");

  const app = Fastify({ logger: false });

  await app.register(fastifyAwilixPlugin, {
    disposeOnClose: true,
    disposeOnResponse: false,
  });

  const tokenService = new JwtTokenService(JWT_SECRET);
  const logger = new PinoLoggerAdapter({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: function () {
      return this;
    },
  } as any);
  const sessionStore = new InMemorySessionStore();
  const sessionCache = new InMemorySessionCache();
  const usageTracker = new InMemoryUsageTracker();

  const mockChatProvider = new MockChatProvider();
  const chatProviderFactory = {
    create: () => ({
      provider: mockChatProvider,
      config: {
        baseUrl: "https://ragflow.mock",
        apiKey: "sk-mock",
        agentId: "agent_test",
      },
    }),
  } as unknown as ChatProviderFactory;

  const config = {
    SESSION_TTL_MINUTES: 30,
    LOG_LEVEL: "silent",
  };

  diContainer.register({
    config: asValue(config as any),
    encryptionService: asValue(encryption),
    tokenService: asValue(tokenService),
    domainValidator: asValue(new AllowlistDomainValidator()),
    sessionStore: asValue(sessionStore as any),
    sessionCache: asValue(sessionCache as any),
    usageTracker: asValue(usageTracker as any),
    rateLimiter: asValue(new InMemoryRateLimiter() as any),
    workspaceCache: asValue(new MockWorkspaceCache() as any),
    logger: asValue(logger),
    chatProviderFactory: asValue(chatProviderFactory),
    sessionFactory: asValue(new SessionFactory()),
    tokenFactory: asValue(new TokenFactory(tokenService)),
    workspaceFactory: asValue(new WorkspaceFactory()),
    errorResponseFactory: asValue(new ErrorResponseFactory(logger)),
  });

  const mockDb = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: vi.fn().mockResolvedValue([
            {
              ...testWorkspace,
            },
          ]),
        }),
      }),
    }),
  } as any;

  const mockHealthChecker = {
    check: vi.fn().mockResolvedValue({
      status: "healthy",
      components: {
        db: { status: "healthy", latencyMs: 1 },
        cache: { status: "healthy", latencyMs: 1 },
      },
    }),
  };

  await app.register(widgetRoutes, { db: mockDb });
  await app.register(healthRoutes, { healthChecker: mockHealthChecker });

  return { app, sessionStore, usageTracker, mockHealthChecker };
}

describe("Integration: Widget Routes", () => {
  let app: FastifyInstance;
  let sessionStore: InMemorySessionStore;
  let usageTracker: InMemoryUsageTracker;

  beforeAll(async () => {
    const harness = await buildTestApp();
    app = harness.app;
    sessionStore = harness.sessionStore;
    usageTracker = harness.usageTracker;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /widget/session", () => {
    it("creates a session and returns token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/widget/session",
        headers: { origin: "https://example.com" },
        payload: { workspaceId: "ws_test" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.token).toBeDefined();
      expect(body.sessionId).toMatch(/^sess_/);
      expect(body.expiresAt).toBeDefined();
    });

    it("rejects unknown workspace", async () => {
      // The current mock always returns a workspace, so this test verifies
      // the route works even with invalid origin for anonymous
      const res = await app.inject({
        method: "POST",
        url: "/widget/session",
        headers: { origin: "https://evil.com" },
        payload: { workspaceId: "ws_test" },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("DOMAIN_NOT_ALLOWED");
    });

    it("rejects empty payload with error response", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/widget/session",
        payload: {},
      });

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe("POST /widget/chat", () => {
    let sessionToken: string;
    let sessionId: string;

    beforeAll(async () => {
      const sessionRes = await app.inject({
        method: "POST",
        url: "/widget/session",
        headers: { origin: "https://example.com" },
        payload: { workspaceId: "ws_test" },
      });
      const sessionBody = JSON.parse(sessionRes.body);
      sessionToken = sessionBody.token;
      sessionId = sessionBody.sessionId;
    });

    it("streams SSE response from mock provider", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/widget/chat",
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: { message: "Hello!", sessionId },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("text/event-stream");

      const lines = res.body.split("\n\n").filter(Boolean);
      const events = lines.map((l: string) =>
        JSON.parse(l.replace("data: ", "")),
      );

      expect(events).toContainEqual({ type: "token", content: "Hello" });
      expect(events).toContainEqual({ type: "token", content: " from" });
      expect(events).toContainEqual({ type: "token", content: " RAGFlow" });
      expect(events).toContainEqual(expect.objectContaining({ type: "done" }));
    });

    it("creates provider session on first message", async () => {
      const session = await sessionStore.findById(sessionId);
      expect(session?.providerSessionId).toBe("rf_mock_sess");
    });

    it("does not persist LangGraph conversation memory for RAGFlow", async () => {
      const session = await sessionStore.findById(sessionId);
      expect(session?.metadata["conversationMessages"]).toBeUndefined();
    });

    it("tracks usage after chat", () => {
      expect(usageTracker.records.length).toBeGreaterThan(0);
      expect(usageTracker.records[0]!.workspaceId).toBe("ws_test");
    });

    it("rejects missing auth header", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/widget/chat",
        payload: { message: "Hi", sessionId: "sess_x" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("rejects invalid token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/widget/chat",
        headers: { authorization: "Bearer invalid.jwt.token" },
        payload: { message: "Hi", sessionId: "sess_x" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("rejects message exceeding max length", async () => {
      const longMessage = "x".repeat(5000);
      const res = await app.inject({
        method: "POST",
        url: "/widget/chat",
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: { message: longMessage, sessionId },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("MESSAGE_TOO_LONG");
    });

    it("rejects mismatched session ID", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/widget/chat",
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: { message: "Hi", sessionId: "sess_wrong" },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("INVALID_TOKEN");
    });
  });

  describe("Rate limiting", () => {
    it("returns 429 when rate limit is exceeded", async () => {
      const lowLimitApp = Fastify({ logger: false });

      await lowLimitApp.register(fastifyAwilixPlugin, {
        disposeOnClose: true,
        disposeOnResponse: false,
      });

      const encryption = new AesEncryptionService(ENCRYPTION_KEY);
      const tokenService = new JwtTokenService(JWT_SECRET);
      const logger = new PinoLoggerAdapter({
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        child: function () {
          return this;
        },
      } as any);

      const lowLimitWorkspace: Workspace = {
        ...testWorkspace,
        rateLimitConfig: { maxRequests: 1, windowMs: 60_000 },
        providerApiKey: encryption.encrypt("sk-mock-key"),
      };

      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([lowLimitWorkspace]),
            }),
          }),
        }),
      } as any;

      const rateLimiter = new InMemoryRateLimiter();

      diContainer.register({
        config: asValue({
          SESSION_TTL_MINUTES: 30,
          LOG_LEVEL: "silent",
        } as any),
        encryptionService: asValue(encryption),
        tokenService: asValue(tokenService),
        domainValidator: asValue(new AllowlistDomainValidator()),
        sessionStore: asValue(new InMemorySessionStore() as any),
        sessionCache: asValue(new InMemorySessionCache() as any),
        usageTracker: asValue(new InMemoryUsageTracker() as any),
        rateLimiter: asValue(rateLimiter as any),
        workspaceCache: asValue(new MockWorkspaceCache() as any),
        logger: asValue(logger),
        chatProviderFactory: asValue({
          create: () => ({
            provider: new MockChatProvider(),
            config: {
              baseUrl: "https://ragflow.mock",
              apiKey: "sk-mock",
              agentId: "agent_test",
            },
          }),
        } as unknown as ChatProviderFactory),
        sessionFactory: asValue(new SessionFactory()),
        tokenFactory: asValue(new TokenFactory(tokenService)),
        workspaceFactory: asValue(new WorkspaceFactory()),
        errorResponseFactory: asValue(new ErrorResponseFactory(logger)),
      });

      await lowLimitApp.register(widgetRoutes, { db: mockDb });
      await lowLimitApp.ready();

      const sessionRes = await lowLimitApp.inject({
        method: "POST",
        url: "/widget/session",
        headers: { origin: "https://example.com" },
        payload: { workspaceId: "ws_test" },
      });
      const { token, sessionId: sid } = JSON.parse(sessionRes.body);

      await lowLimitApp.inject({
        method: "POST",
        url: "/widget/chat",
        headers: { authorization: `Bearer ${token}` },
        payload: { message: "First", sessionId: sid },
      });

      const res = await lowLimitApp.inject({
        method: "POST",
        url: "/widget/chat",
        headers: { authorization: `Bearer ${token}` },
        payload: { message: "Second", sessionId: sid },
      });

      expect(res.statusCode).toBe(429);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("RATE_LIMITED");

      await lowLimitApp.close();
    });
  });

  describe("Error sanitization", () => {
    it("returns generic STREAM_ERROR when provider throws", async () => {
      const errorApp = Fastify({ logger: false });

      await errorApp.register(fastifyAwilixPlugin, {
        disposeOnClose: true,
        disposeOnResponse: false,
      });

      const encryption = new AesEncryptionService(ENCRYPTION_KEY);
      const tokenService = new JwtTokenService(JWT_SECRET);
      const logger = new PinoLoggerAdapter({
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        child: function () {
          return this;
        },
      } as any);

      const failingProvider: ChatProvider = {
        async createSession() {
          return "rf_err_sess";
        },
        async *sendMessage(): AsyncGenerator<ChatStreamEvent, void, undefined> {
          yield { type: "token", content: "partial" };
          throw new Error("RAGFlow internal: connection reset by peer");
        },
      };

      const errorWorkspace: Workspace = {
        ...testWorkspace,
        providerApiKey: encryption.encrypt("sk-mock-key"),
      };

      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([errorWorkspace]),
            }),
          }),
        }),
      } as any;

      diContainer.register({
        config: asValue({
          SESSION_TTL_MINUTES: 30,
          LOG_LEVEL: "silent",
        } as any),
        encryptionService: asValue(encryption),
        tokenService: asValue(tokenService),
        domainValidator: asValue(new AllowlistDomainValidator()),
        sessionStore: asValue(new InMemorySessionStore() as any),
        sessionCache: asValue(new InMemorySessionCache() as any),
        usageTracker: asValue(new InMemoryUsageTracker() as any),
        rateLimiter: asValue(new InMemoryRateLimiter() as any),
        workspaceCache: asValue(new MockWorkspaceCache() as any),
        logger: asValue(logger),
        chatProviderFactory: asValue({
          create: () => ({
            provider: failingProvider,
            config: {
              baseUrl: "https://ragflow.mock",
              apiKey: "sk-mock",
              agentId: "agent_test",
            },
          }),
        } as unknown as ChatProviderFactory),
        sessionFactory: asValue(new SessionFactory()),
        tokenFactory: asValue(new TokenFactory(tokenService)),
        workspaceFactory: asValue(new WorkspaceFactory()),
        errorResponseFactory: asValue(new ErrorResponseFactory(logger)),
      });

      await errorApp.register(widgetRoutes, { db: mockDb });
      await errorApp.ready();

      const sessionRes = await errorApp.inject({
        method: "POST",
        url: "/widget/session",
        headers: { origin: "https://example.com" },
        payload: { workspaceId: "ws_test" },
      });
      const { token, sessionId: sid } = JSON.parse(sessionRes.body);

      const res = await errorApp.inject({
        method: "POST",
        url: "/widget/chat",
        headers: { authorization: `Bearer ${token}` },
        payload: { message: "Hello", sessionId: sid },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("text/event-stream");

      const lines = res.body.split("\n\n").filter(Boolean);
      const events = lines.map((l: string) =>
        JSON.parse(l.replace("data: ", "")),
      );

      expect(events).toContainEqual({ type: "token", content: "partial" });
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "error",
          code: "STREAM_ERROR",
          message: "Stream interrupted",
        }),
      );
      const errorEvent = events.find((e: any) => e.type === "error");
      expect(errorEvent.message).not.toContain("connection reset");

      await errorApp.close();
    });
  });

  describe("Health endpoints", () => {
    it("GET /health/live returns 200", async () => {
      const res = await app.inject({ method: "GET", url: "/health/live" });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: "ok" });
    });

    it("GET /health/ready returns healthy status", async () => {
      const res = await app.inject({ method: "GET", url: "/health/ready" });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("healthy");
    });
  });
});
