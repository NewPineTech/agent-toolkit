import type {
  RateLimiter,
  RateLimitResult,
} from '../../interfaces/rate-limiter.interface.js';

interface WindowEntry {
  timestamps: number[];
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, WindowEntry>();

  async check(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowMs;

    let entry = this.windows.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.windows.set(key, entry);
    }

    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    const currentCount = entry.timestamps.length;
    const resetAt = new Date(now + windowMs);

    if (currentCount >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil(windowMs / 1000),
      };
    }

    entry.timestamps.push(now);
    const remaining = Math.max(0, limit - currentCount - 1);
    return { allowed: true, remaining, resetAt };
  }

  clear(): void {
    this.windows.clear();
  }
}
