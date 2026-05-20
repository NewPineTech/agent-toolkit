import { describe, expect, it, vi } from "vitest";
import * as db from "./db.js";

type DbWithGeneratedWorkspaceHelpers = typeof db & {
  getNextGeneratedWorkspaceId?: (pool: {
    query: (sql: string) => Promise<{ rows: Array<{ id: string }> }>;
  }) => Promise<string>;
};

describe("workspace ID generation helpers", () => {
  it("computes the next generated workspace ID from numeric ws_ suffixes only", async () => {
    const helpers = db as DbWithGeneratedWorkspaceHelpers;
    expect(typeof helpers.getNextGeneratedWorkspaceId).toBe("function");

    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { id: "customer_a" },
          { id: "ws_1" },
          { id: "ws_alpha" },
          { id: "ws_002" },
          { id: "ws_10" },
          { id: "ws_10_backup" },
        ],
      }),
    };

    await expect(helpers.getNextGeneratedWorkspaceId!(pool)).resolves.toBe(
      "ws_11",
    );
    expect(pool.query).toHaveBeenCalledWith(
      "select id from workspaces where id like $1",
      ["ws_%"],
    );
  });
});
