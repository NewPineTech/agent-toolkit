import type { Redis } from 'ioredis';
import type {
  RateLimiter,
  RateLimitResult,
} from '../../interfaces/rate-limiter.interface.js';

const KEY_PREFIX = 'rl:';

export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: Redis) {}

  async check(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    const redisKey = `${KEY_PREFIX}${key}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    const member = `${now}:${Math.random()}`;
    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(redisKey, '-inf', windowStart);
    pipeline.zcard(redisKey);
    pipeline.pexpire(redisKey, windowMs);

    const results = await pipeline.exec();
    if (!results) {
      return { allowed: true, remaining: limit, resetAt: new Date(now + windowMs) };
    }

    const currentCount = (results[1]?.[1] as number) ?? 0;
    const resetAt = new Date(now + windowMs);

    if (currentCount >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil(windowMs / 1000),
      };
    }

    await this.redis.pipeline()
      .zadd(redisKey, now, member)
      .pexpire(redisKey, windowMs)
      .exec();

    const remaining = Math.max(0, limit - currentCount - 1);
    return { allowed: true, remaining, resetAt };
  }
}
