import type { Session } from "@agent-toolkit/types";
import type { SessionCache } from "../../interfaces/session-cache.interface.js";

interface CacheEntry {
  session: Session;
  expiresAt: number;
}

export class InMemorySessionCache implements SessionCache {
  private readonly cache = new Map<string, CacheEntry>();

  async get(sessionId: string): Promise<Session | null> {
    const entry = this.cache.get(sessionId);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(sessionId);
      return null;
    }

    return entry.session;
  }

  async set(session: Session, ttlSeconds: number): Promise<void> {
    this.cache.set(session.id, {
      session,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(sessionId: string): Promise<void> {
    this.cache.delete(sessionId);
  }

  clear(): void {
    this.cache.clear();
  }
}
