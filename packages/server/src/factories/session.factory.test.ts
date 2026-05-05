import { describe, it, expect } from "vitest";
import { SessionFactory } from "./session.factory.js";

describe("SessionFactory", () => {
  const factory = new SessionFactory();

  it("creates a session with sess_ prefix", () => {
    const session = factory.create({
      workspaceId: "ws_1",
      ttlMinutes: 30,
    });

    expect(session.id).toMatch(/^sess_/);
    expect(session.id.length).toBeGreaterThan(5);
  });

  it("sets correct workspace and timestamps", () => {
    const before = Date.now();
    const session = factory.create({
      workspaceId: "ws_1",
      ttlMinutes: 30,
    });
    const after = Date.now();

    expect(session.workspaceId).toBe("ws_1");
    expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(session.createdAt.getTime()).toBeLessThanOrEqual(after);
    expect(session.lastActiveAt).toEqual(session.createdAt);
  });

  it("calculates expiresAt from ttlMinutes", () => {
    const session = factory.create({
      workspaceId: "ws_1",
      ttlMinutes: 60,
    });

    const diff = session.expiresAt.getTime() - session.createdAt.getTime();
    expect(diff).toBe(60 * 60 * 1000);
  });

  it("defaults optional fields to null", () => {
    const session = factory.create({
      workspaceId: "ws_1",
      ttlMinutes: 30,
    });

    expect(session.providerSessionId).toBeNull();
    expect(session.userId).toBeNull();
    expect(session.userFingerprint).toBeNull();
    expect(session.metadata).toEqual({});
  });

  it("passes through userId and fingerprint", () => {
    const session = factory.create({
      workspaceId: "ws_1",
      ttlMinutes: 30,
      userId: "user_42",
      fingerprint: "fp_abc",
    });

    expect(session.userId).toBe("user_42");
    expect(session.userFingerprint).toBe("fp_abc");
  });

  it("generates unique IDs", () => {
    const ids = new Set(
      Array.from(
        { length: 100 },
        () => factory.create({ workspaceId: "ws", ttlMinutes: 1 }).id,
      ),
    );
    expect(ids.size).toBe(100);
  });
});
