export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

export interface RateLimiter {
  /** Check if a request is allowed under the rate limit. */
  check(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}
