import type { Session } from "@agent-toolkit/types";

export interface SessionCache {
  /** Get a cached session. Returns null on cache miss. */
  get(sessionId: string): Promise<Session | null>;

  /** Cache a session with a TTL in seconds. */
  set(session: Session, ttlSeconds: number): Promise<void>;

  /** Remove a session from cache. */
  delete(sessionId: string): Promise<void>;
}
