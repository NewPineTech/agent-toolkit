import type { Redis } from "ioredis";
import type pg from "pg";
import type { ComponentHealth } from "@agent-toolkit/types";
import type {
  HealthChecker,
  HealthStatus,
} from "../../interfaces/health-checker.interface.js";

export class CompositeHealthChecker implements HealthChecker {
  constructor(
    private readonly pool: pg.Pool,
    private readonly redis: Redis,
  ) {}

  async check(): Promise<HealthStatus> {
    const [db, cache] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
    ]);

    const components: Record<string, ComponentHealth> = { db, cache };
    const allHealthy = Object.values(components).every(
      (c) => c.status === "healthy",
    );

    return {
      status: allHealthy ? "healthy" : "unhealthy",
      components,
    };
  }

  private async checkPostgres(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const client = await this.pool.connect();
      try {
        await client.query("SELECT 1");
      } finally {
        client.release();
      }
      return { status: "healthy", latencyMs: Date.now() - start };
    } catch (err) {
      return {
        status: "unhealthy",
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  private async checkRedis(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      await this.redis.ping();
      return { status: "healthy", latencyMs: Date.now() - start };
    } catch (err) {
      return {
        status: "unhealthy",
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }
}
