import { describe, it, expect, vi, beforeEach } from "vitest";
import { RedisWorkspaceCache } from "./redis-workspace.cache.js";
import type { Workspace } from "@agent-toolkit/types";
import { ProviderType, AuthMode } from "@agent-toolkit/types";

function createMockRedis() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  } as any;
}

const makeWorkspace = (): Workspace => ({
  id: "ws_1",
  providerType: ProviderType.RAGFLOW,
  providerAgentId: "agent_1",
  providerApiKey: "enc_key",
  providerBaseUrl: "https://ragflow.test",
  allowedDomains: ["https://example.com"],
  authMode: AuthMode.ANONYMOUS,
  authSecret: null,
  rateLimitConfig: { maxRequests: 30, windowMs: 60000 },
  maxMessageLength: 4000,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
});

describe("RedisWorkspaceCache", () => {
  let redis: ReturnType<typeof createMockRedis>;
  let cache: RedisWorkspaceCache;

  beforeEach(() => {
    redis = createMockRedis();
    cache = new RedisWorkspaceCache(redis, 600);
  });

  it("returns null when key does not exist", async () => {
    redis.get.mockResolvedValue(null);
    expect(await cache.get("ws_missing")).toBeNull();
    expect(redis.get).toHaveBeenCalledWith("ws:ws_missing");
  });

  it("deserializes workspace with Date reconstruction", async () => {
    const ws = makeWorkspace();
    redis.get.mockResolvedValue(
      JSON.stringify({
        ...ws,
        createdAt: ws.createdAt.toISOString(),
        updatedAt: ws.updatedAt.toISOString(),
      }),
    );

    const result = await cache.get("ws_1");
    expect(result).not.toBeNull();
    expect(result!.createdAt).toBeInstanceOf(Date);
    expect(result!.updatedAt).toBeInstanceOf(Date);
    expect(result!.providerType).toBe("ragflow");
  });

  it("serializes and stores with custom TTL", async () => {
    await cache.set(makeWorkspace());

    expect(redis.set).toHaveBeenCalledWith(
      "ws:ws_1",
      expect.any(String),
      "EX",
      600,
    );
  });

  it("uses default TTL of 300 when not specified", () => {
    const defaultCache = new RedisWorkspaceCache(redis);
    defaultCache.set(makeWorkspace());
    expect(redis.set).toHaveBeenCalledWith(
      "ws:ws_1",
      expect.any(String),
      "EX",
      300,
    );
  });

  it("invalidates by workspace ID", async () => {
    await cache.invalidate("ws_1");
    expect(redis.del).toHaveBeenCalledWith("ws:ws_1");
  });
});
