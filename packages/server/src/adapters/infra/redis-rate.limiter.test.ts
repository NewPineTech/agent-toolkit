import { describe, it, expect, vi } from "vitest";
import { RedisRateLimiter } from "./redis-rate.limiter.js";

function createMockRedis(currentCount: number) {
  const checkPipeline = {
    zremrangebyscore: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    pexpire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([
      [null, 0],
      [null, currentCount],
      [null, 1],
    ]),
  };
  const addPipeline = {
    zadd: vi.fn().mockReturnThis(),
    pexpire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([
      [null, 1],
      [null, 1],
    ]),
  };

  let callCount = 0;
  return {
    pipeline: vi.fn().mockImplementation(() => {
      callCount++;
      return callCount === 1 ? checkPipeline : addPipeline;
    }),
    _checkPipeline: checkPipeline,
    _addPipeline: addPipeline,
  } as any;
}

describe("RedisRateLimiter", () => {
  it("allows requests under the limit", async () => {
    const redis = createMockRedis(3);
    const limiter = new RedisRateLimiter(redis);

    const result = await limiter.check("user:1", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
    expect(result.resetAt).toBeInstanceOf(Date);
  });

  it("blocks requests at the limit", async () => {
    const redis = createMockRedis(5);
    const limiter = new RedisRateLimiter(redis);

    const result = await limiter.check("user:1", 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBe(60);
  });

  it("blocks requests over the limit", async () => {
    const redis = createMockRedis(6);
    const limiter = new RedisRateLimiter(redis);

    const result = await limiter.check("user:1", 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBe(60);
  });

  it("does not add entry when rejected", async () => {
    const redis = createMockRedis(5);
    const limiter = new RedisRateLimiter(redis);

    await limiter.check("user:1", 5, 60_000);
    expect(redis.pipeline).toHaveBeenCalledTimes(1);
  });

  it("uses correct Redis key prefix", async () => {
    const redis = createMockRedis(1);
    const limiter = new RedisRateLimiter(redis);

    await limiter.check("chat:ws_1:user_42", 10, 60_000);

    const pipeline = redis._checkPipeline;
    expect(pipeline.zremrangebyscore).toHaveBeenCalledWith(
      "rl:chat:ws_1:user_42",
      "-inf",
      expect.any(Number),
    );
  });

  it("sets sliding window expiry", async () => {
    const redis = createMockRedis(1);
    const limiter = new RedisRateLimiter(redis);

    await limiter.check("key", 10, 30_000);

    const pipeline = redis._checkPipeline;
    expect(pipeline.pexpire).toHaveBeenCalledWith("rl:key", 30_000);
  });

  it("handles null pipeline results gracefully", async () => {
    const redis = createMockRedis(1);
    redis._checkPipeline.exec.mockResolvedValue(null);
    const limiter = new RedisRateLimiter(redis);

    const result = await limiter.check("key", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
  });
});
