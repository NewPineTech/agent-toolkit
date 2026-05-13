import { describe, it, expect, vi, beforeEach } from "vitest";
import { PostgresUsageTracker } from "../postgres-usage.tracker.js";

function createMockDb() {
  const chain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([]),
  };
  return {
    insert: vi.fn().mockReturnValue(chain),
    select: vi.fn().mockReturnValue(chain),
    _chain: chain,
  } as any;
}

describe("PostgresUsageTracker", () => {
  let db: ReturnType<typeof createMockDb>;
  let tracker: PostgresUsageTracker;

  beforeEach(() => {
    db = createMockDb();
    tracker = new PostgresUsageTracker(db);
  });

  it("increments usage with upsert", async () => {
    await tracker.increment("ws_1", "2026-01-15");

    expect(db.insert).toHaveBeenCalled();
    expect(db._chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws_1",
        date: "2026-01-15",
        messageCount: 1,
        tokenCount: 0,
      }),
    );
    expect(db._chain.onConflictDoUpdate).toHaveBeenCalled();
  });

  it("returns usage records for date range", async () => {
    const rows = [
      {
        workspaceId: "ws_1",
        date: "2026-01-15",
        messageCount: 10,
        tokenCount: 500,
      },
      {
        workspaceId: "ws_1",
        date: "2026-01-16",
        messageCount: 5,
        tokenCount: 200,
      },
    ];
    db._chain.orderBy.mockResolvedValue(rows);

    const result = await tracker.getUsage("ws_1", "2026-01-15", "2026-01-16");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      workspaceId: "ws_1",
      date: "2026-01-15",
      messageCount: 10,
      tokenCount: 500,
    });
  });

  it("returns empty array when no usage found", async () => {
    db._chain.orderBy.mockResolvedValue([]);
    const result = await tracker.getUsage("ws_1", "2026-01-01", "2026-01-31");
    expect(result).toEqual([]);
  });
});
