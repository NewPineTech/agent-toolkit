import type { Redis } from "ioredis";
import type { Workspace } from "@agent-toolkit/types";

const KEY_PREFIX = "ws:";
const DEFAULT_TTL_SECONDS = 300;

export class RedisWorkspaceCache {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ) {}

  async get(workspaceId: string): Promise<Workspace | null> {
    const data = await this.redis.get(`${KEY_PREFIX}${workspaceId}`);
    if (!data) return null;

    const parsed = JSON.parse(data) as Record<string, unknown>;
    return {
      ...parsed,
      createdAt: new Date(parsed["createdAt"] as string),
      updatedAt: new Date(parsed["updatedAt"] as string),
    } as Workspace;
  }

  async set(workspace: Workspace): Promise<void> {
    const data = JSON.stringify({
      ...workspace,
      createdAt: workspace.createdAt.toISOString(),
      updatedAt: workspace.updatedAt.toISOString(),
    });
    await this.redis.set(
      `${KEY_PREFIX}${workspace.id}`,
      data,
      "EX",
      this.ttlSeconds,
    );
  }

  async invalidate(workspaceId: string): Promise<void> {
    await this.redis.del(`${KEY_PREFIX}${workspaceId}`);
  }
}
