import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRateLimiter } from "./in-memory-rate.limiter.js";

describe("InMemoryRateLimiter", () => {
  let limiter: InMemoryRateLimiter;

  beforeEach(() => {
    limiter = new InMemoryRateLimiter();
  });

  it("allows requests under the limit", async () => {
    const result = await limiter.check("user:1", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.resetAt).toBeInstanceOf(Date);
  });

  it("tracks remaining count correctly", async () => {
    for (let i = 0; i < 3; i++) {
      await limiter.check("user:1", 5, 60_000);
    }
    const result = await limiter.check("user:1", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("blocks requests over the limit", async () => {
    for (let i = 0; i < 5; i++) {
      await limiter.check("user:1", 5, 60_000);
    }
    const result = await limiter.check("user:1", 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeDefined();
  });

  it("isolates keys from each other", async () => {
    for (let i = 0; i < 5; i++) {
      await limiter.check("user:1", 5, 60_000);
    }
    const blocked = await limiter.check("user:1", 5, 60_000);
    expect(blocked.allowed).toBe(false);

    const allowed = await limiter.check("user:2", 5, 60_000);
    expect(allowed.allowed).toBe(true);
  });

  it("clear() resets all windows", async () => {
    for (let i = 0; i < 5; i++) {
      await limiter.check("user:1", 5, 60_000);
    }
    limiter.clear();
    const result = await limiter.check("user:1", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("expires old timestamps outside the window", async () => {
    const result1 = await limiter.check("user:1", 2, 1);
    expect(result1.allowed).toBe(true);

    await new Promise((r) => setTimeout(r, 10));

    const result2 = await limiter.check("user:1", 2, 1);
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(1);
  });
});
