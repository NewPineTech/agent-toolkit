import type { Redis } from "ioredis";
import type {
  RateLimiter,
  RateLimitResult,
} from "../../interfaces/rate-limiter.interface.js";

const KEY_PREFIX = "rl:";

// Atomic sliding-window rate limit: removes expired entries, checks count,
// conditionally adds the new member, and sets TTL — all in one round-trip.
const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_start = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local window_ms = tonumber(ARGV[4])
local member = ARGV[5]

redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)
local count = redis.call('ZCARD', key)

if count >= limit then
  return {0, count}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window_ms)
return {1, count}
`;

export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: Redis) {
    this.redis.defineCommand("rateLimit", {
      numberOfKeys: 1,
      lua: RATE_LIMIT_SCRIPT,
    });
  }

  async check(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    const redisKey = `${KEY_PREFIX}${key}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    const member = `${now}:${Math.random()}`;
    const resetAt = new Date(now + windowMs);

    const result = await (
      this.redis as Redis & {
        rateLimit: (
          key: string,
          now: number,
          windowStart: number,
          limit: number,
          windowMs: number,
          member: string,
        ) => Promise<[number, number]>;
      }
    ).rateLimit(redisKey, now, windowStart, limit, windowMs, member);

    const [allowed, count] = result;

    if (!allowed) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil(windowMs / 1000),
      };
    }

    const remaining = Math.max(0, limit - count - 1);
    return { allowed: true, remaining, resetAt };
  }
}
