import { describe, it, expect, vi } from "vitest";
import { RedisRateLimiter } from "../redis-rate.limiter.js";

function createMockRedis(allowedResult: [number, number]) {
  return {
    defineCommand: vi.fn(),
    rateLimit: vi.fn().mockResolvedValue(allowedResult),
  } as any;
}

describe("RedisRateLimiter", () => {
  it("allows requests under the limit", async () => {
    const redis = createMockRedis([1, 3]);
    const limiter = new RedisRateLimiter(redis);

    const result = await limiter.check("user:1", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
    expect(result.resetAt).toBeInstanceOf(Date);
  });

  it("blocks requests at the limit", async () => {
    const redis = createMockRedis([0, 5]);
    const limiter = new RedisRateLimiter(redis);

    const result = await limiter.check("user:1", 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBe(60);
  });

  it("blocks requests over the limit", async () => {
    const redis = createMockRedis([0, 6]);
    const limiter = new RedisRateLimiter(redis);

    const result = await limiter.check("user:1", 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBe(60);
  });

  it("uses correct Redis key prefix", async () => {
    const redis = createMockRedis([1, 1]);
    const limiter = new RedisRateLimiter(redis);

    await limiter.check("chat:ws_1:user_42", 10, 60_000);

    expect(redis.rateLimit).toHaveBeenCalledWith(
      "rl:chat:ws_1:user_42",
      expect.any(Number),
      expect.any(Number),
      10,
      60_000,
      expect.any(String),
    );
  });

  it("passes windowMs for expiry", async () => {
    const redis = createMockRedis([1, 1]);
    const limiter = new RedisRateLimiter(redis);

    await limiter.check("key", 10, 30_000);

    expect(redis.rateLimit).toHaveBeenCalledWith(
      "rl:key",
      expect.any(Number),
      expect.any(Number),
      10,
      30_000,
      expect.any(String),
    );
  });

  it("defines the rateLimit command on construction", () => {
    const redis = createMockRedis([1, 0]);
    new RedisRateLimiter(redis);

    expect(redis.defineCommand).toHaveBeenCalledWith("rateLimit", {
      numberOfKeys: 1,
      lua: expect.any(String),
    });
  });

  it("calculates correct remaining count", async () => {
    const redis = createMockRedis([1, 7]);
    const limiter = new RedisRateLimiter(redis);

    const result = await limiter.check("key", 10, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });
});
