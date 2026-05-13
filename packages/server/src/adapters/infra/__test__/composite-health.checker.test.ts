import { describe, it, expect, vi } from "vitest";
import { CompositeHealthChecker } from "../composite-health.checker.js";

function createMockPool(healthy = true) {
  const client = {
    query: healthy
      ? vi.fn().mockResolvedValue({})
      : vi.fn().mockRejectedValue(new Error("connection refused")),
    release: vi.fn(),
  };
  return {
    connect: vi.fn().mockResolvedValue(client),
  } as any;
}

function createMockRedis(healthy = true) {
  return {
    ping: healthy
      ? vi.fn().mockResolvedValue("PONG")
      : vi.fn().mockRejectedValue(new Error("redis down")),
  } as any;
}

describe("CompositeHealthChecker", () => {
  it("returns healthy when all components are up", async () => {
    const checker = new CompositeHealthChecker(
      createMockPool(true),
      createMockRedis(true),
    );
    const status = await checker.check();

    expect(status.status).toBe("healthy");
    expect(status.components["db"]!.status).toBe("healthy");
    expect(status.components["cache"]!.status).toBe("healthy");
    expect(status.components["db"]!.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns unhealthy when postgres is down", async () => {
    const checker = new CompositeHealthChecker(
      createMockPool(false),
      createMockRedis(true),
    );
    const status = await checker.check();

    expect(status.status).toBe("unhealthy");
    expect(status.components["db"]!.status).toBe("unhealthy");
    expect(status.components["db"]!.message).toBe("connection refused");
    expect(status.components["cache"]!.status).toBe("healthy");
  });

  it("returns unhealthy when redis is down", async () => {
    const checker = new CompositeHealthChecker(
      createMockPool(true),
      createMockRedis(false),
    );
    const status = await checker.check();

    expect(status.status).toBe("unhealthy");
    expect(status.components["cache"]!.status).toBe("unhealthy");
    expect(status.components["cache"]!.message).toBe("redis down");
  });

  it("returns unhealthy when both are down", async () => {
    const checker = new CompositeHealthChecker(
      createMockPool(false),
      createMockRedis(false),
    );
    const status = await checker.check();

    expect(status.status).toBe("unhealthy");
  });

  it("releases the pg client even on error", async () => {
    const client = {
      query: vi.fn().mockRejectedValue(new Error("fail")),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as any;
    const checker = new CompositeHealthChecker(pool, createMockRedis(true));

    await checker.check();
    expect(client.release).toHaveBeenCalled();
  });
});
