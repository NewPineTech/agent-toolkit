import { eq, and, gte, lte, sql } from "drizzle-orm";
import type { UsageRecord } from "@agent-toolkit/types";
import type { UsageTracker } from "../../interfaces/usage-tracker.interface.js";
import type { Database } from "../../db/index.js";
import { usage } from "../../db/schema.js";

export class PostgresUsageTracker implements UsageTracker {
  constructor(private readonly db: Database) {}

  async increment(workspaceId: string, date: string): Promise<void> {
    await this.db
      .insert(usage)
      .values({
        workspaceId,
        date,
        messageCount: 1,
        tokenCount: 0,
      })
      .onConflictDoUpdate({
        target: [usage.workspaceId, usage.date],
        set: {
          messageCount: sql`${usage.messageCount} + 1`,
        },
      });
  }

  async getUsage(
    workspaceId: string,
    from: string,
    to: string,
  ): Promise<UsageRecord[]> {
    const rows = await this.db
      .select()
      .from(usage)
      .where(
        and(
          eq(usage.workspaceId, workspaceId),
          gte(usage.date, from),
          lte(usage.date, to),
        ),
      )
      .orderBy(usage.date);

    return rows.map((row) => ({
      workspaceId: row.workspaceId,
      date: row.date,
      messageCount: row.messageCount,
      tokenCount: row.tokenCount,
    }));
  }
}
