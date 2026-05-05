import { describe, it, expect, vi, beforeEach } from "vitest";
import { RedisSessionCache } from "./redis-session.cache.js";
import type { Session } from "@agent-toolkit/types";

function createMockRedis() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  } as any;
}

const makeSession = (): Session => ({
  id: "sess_1",
  workspaceId: "ws_1",
  providerSessionId: "rf_1",
  userId: "user_1",
  userFingerprint: "fp_1",
  metadata: { key: "val" },
  createdAt: new Date("2026-01-01T00:00:00Z"),
  lastActiveAt: new Date("2026-01-01T01:00:00Z"),
  expiresAt: new Date("2026-01-01T02:00:00Z"),
});

describe("RedisSessionCache", () => {
  let redis: ReturnType<typeof createMockRedis>;
  let cache: RedisSessionCache;

  beforeEach(() => {
    redis = createMockRedis();
    cache = new RedisSessionCache(redis);
  });

  it("returns null when key does not exist", async () => {
    redis.get.mockResolvedValue(null);
    expect(await cache.get("sess_missing")).toBeNull();
    expect(redis.get).toHaveBeenCalledWith("session:sess_missing");
  });

  it("deserializes session with Date reconstruction", async () => {
    const session = makeSession();
    redis.get.mockResolvedValue(
      JSON.stringify({
        ...session,
        createdAt: session.createdAt.toISOString(),
        lastActiveAt: session.lastActiveAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
      }),
    );

    const result = await cache.get("sess_1");
    expect(result).not.toBeNull();
    expect(result!.createdAt).toBeInstanceOf(Date);
    expect(result!.lastActiveAt).toBeInstanceOf(Date);
    expect(result!.expiresAt).toBeInstanceOf(Date);
    expect(result!.id).toBe("sess_1");
  });

  it("serializes session with ISO dates and sets TTL", async () => {
    const session = makeSession();
    await cache.set(session, 300);

    expect(redis.set).toHaveBeenCalledWith(
      "session:sess_1",
      expect.any(String),
      "EX",
      300,
    );

    const stored = JSON.parse(redis.set.mock.calls[0][1]);
    expect(stored.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("deletes by session ID", async () => {
    await cache.delete("sess_1");
    expect(redis.del).toHaveBeenCalledWith("session:sess_1");
  });
});
