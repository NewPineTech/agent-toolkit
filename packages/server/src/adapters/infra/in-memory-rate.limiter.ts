import type {
  RateLimiter,
  RateLimitResult,
} from "../../interfaces/rate-limiter.interface.js";

interface WindowEntry {
  timestamps: number[];
}

const PRUNE_INTERVAL_MS = 60_000;

export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, WindowEntry>();
  private lastPrune = Date.now();

  async check(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowMs;

    if (now - this.lastPrune > PRUNE_INTERVAL_MS) {
      this.prune(now, windowMs);
      this.lastPrune = now;
    }

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

  private prune(now: number, defaultWindowMs: number): void {
    const cutoff = now - defaultWindowMs;
    for (const [key, entry] of this.windows) {
      if (
        entry.timestamps.length === 0 ||
        entry.timestamps[entry.timestamps.length - 1]! < cutoff
      ) {
        this.windows.delete(key);
      }
    }
  }

  clear(): void {
    this.windows.clear();
  }
}
