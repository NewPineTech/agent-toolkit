import { eq, and } from 'drizzle-orm';
import type { Session } from '@agent-toolkit/types';
import type { SessionStore } from '../../interfaces/session-store.interface.js';
import type { Database } from '../../db/index.js';
import { sessions } from '../../db/schema.js';

export class PostgresSessionStore implements SessionStore {
  constructor(private readonly db: Database) {}

  async create(session: Session): Promise<void> {
    await this.db.insert(sessions).values({
      id: session.id,
      workspaceId: session.workspaceId,
      providerSessionId: session.providerSessionId,
      userId: session.userId,
      userFingerprint: session.userFingerprint,
      metadata: session.metadata,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      expiresAt: session.expiresAt,
    });
  }

  async findById(id: string): Promise<Session | null> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return this.toDomain(row);
  }

  async updateLastActive(id: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ lastActiveAt: new Date() })
      .where(eq(sessions.id, id));
  }

  async updateProviderSessionId(
    id: string,
    providerSessionId: string,
  ): Promise<void> {
    await this.db
      .update(sessions)
      .set({ providerSessionId })
      .where(eq(sessions.id, id));
  }

  async findByWorkspaceAndFingerprint(
    workspaceId: string,
    fingerprint: string,
  ): Promise<Session | null> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.workspaceId, workspaceId),
          eq(sessions.userFingerprint, fingerprint),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return this.toDomain(row);
  }

  private toDomain(row: typeof sessions.$inferSelect): Session {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      providerSessionId: row.providerSessionId,
      userId: row.userId,
      userFingerprint: row.userFingerprint,
      metadata: row.metadata,
      createdAt: row.createdAt,
      lastActiveAt: row.lastActiveAt,
      expiresAt: row.expiresAt,
    };
  }
}
