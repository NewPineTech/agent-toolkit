import { describe, it, expect, vi, beforeEach } from "vitest";
import { PostgresSessionStore } from "./postgres-session.store.js";
import type { Session } from "@agent-toolkit/types";

const makeSession = (): Session => ({
  id: "sess_1",
  workspaceId: "ws_1",
  providerSessionId: null,
  userId: "user_1",
  userFingerprint: "fp_abc",
  metadata: {},
  createdAt: new Date("2026-01-01T00:00:00Z"),
  lastActiveAt: new Date("2026-01-01T00:00:00Z"),
  expiresAt: new Date("2026-01-01T01:00:00Z"),
});

const makeRow = () => ({
  id: "sess_1",
  workspaceId: "ws_1",
  providerSessionId: null,
  userId: "user_1",
  userFingerprint: "fp_abc",
  metadata: {},
  createdAt: new Date("2026-01-01T00:00:00Z"),
  lastActiveAt: new Date("2026-01-01T00:00:00Z"),
  expiresAt: new Date("2026-01-01T01:00:00Z"),
});

function createMockDb() {
  const chain = {
    values: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    set: vi.fn().mockReturnThis(),
  };
  return {
    insert: vi.fn().mockReturnValue(chain),
    select: vi.fn().mockReturnValue(chain),
    update: vi.fn().mockReturnValue(chain),
    _chain: chain,
  } as any;
}

describe("PostgresSessionStore", () => {
  let db: ReturnType<typeof createMockDb>;
  let store: PostgresSessionStore;

  beforeEach(() => {
    db = createMockDb();
    store = new PostgresSessionStore(db);
  });

  it("creates a session by inserting into DB", async () => {
    await store.create(makeSession());
    expect(db.insert).toHaveBeenCalled();
    expect(db._chain.values).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sess_1", workspaceId: "ws_1" }),
    );
  });

  it("returns null when session not found", async () => {
    db._chain.limit.mockResolvedValue([]);
    const result = await store.findById("sess_missing");
    expect(result).toBeNull();
  });

  it("returns domain object when session found", async () => {
    db._chain.limit.mockResolvedValue([makeRow()]);
    const result = await store.findById("sess_1");

    expect(result).not.toBeNull();
    expect(result!.id).toBe("sess_1");
    expect(result!.createdAt).toBeInstanceOf(Date);
  });

  it("updates lastActiveAt", async () => {
    await store.updateLastActive("sess_1");
    expect(db.update).toHaveBeenCalled();
    expect(db._chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ lastActiveAt: expect.any(Date) }),
    );
  });

  it("updates providerSessionId", async () => {
    await store.updateProviderSessionId("sess_1", "rf_sess_99");
    expect(db.update).toHaveBeenCalled();
    expect(db._chain.set).toHaveBeenCalledWith({
      providerSessionId: "rf_sess_99",
    });
  });

  it("finds session by workspace and fingerprint", async () => {
    db._chain.limit.mockResolvedValue([makeRow()]);
    const result = await store.findByWorkspaceAndFingerprint("ws_1", "fp_abc");
    expect(result).not.toBeNull();
    expect(result!.workspaceId).toBe("ws_1");
  });

  it("returns null when workspace+fingerprint combo not found", async () => {
    db._chain.limit.mockResolvedValue([]);
    const result = await store.findByWorkspaceAndFingerprint("ws_1", "fp_none");
    expect(result).toBeNull();
  });
});
