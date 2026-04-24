import type { Redis } from 'ioredis';
import type { Session } from '@agent-toolkit/types';
import type { SessionCache } from '../../interfaces/session-cache.interface.js';

const KEY_PREFIX = 'session:';

export class RedisSessionCache implements SessionCache {
  constructor(private readonly redis: Redis) {}

  async get(sessionId: string): Promise<Session | null> {
    const data = await this.redis.get(`${KEY_PREFIX}${sessionId}`);
    if (!data) return null;

    const parsed = JSON.parse(data) as Record<string, unknown>;
    return {
      ...parsed,
      createdAt: new Date(parsed['createdAt'] as string),
      lastActiveAt: new Date(parsed['lastActiveAt'] as string),
      expiresAt: new Date(parsed['expiresAt'] as string),
    } as Session;
  }

  async set(session: Session, ttlSeconds: number): Promise<void> {
    const data = JSON.stringify({
      ...session,
      createdAt: session.createdAt.toISOString(),
      lastActiveAt: session.lastActiveAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    });
    await this.redis.set(`${KEY_PREFIX}${session.id}`, data, 'EX', ttlSeconds);
  }

  async delete(sessionId: string): Promise<void> {
    await this.redis.del(`${KEY_PREFIX}${sessionId}`);
  }
}
