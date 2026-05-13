import { describe, it, expect } from "vitest";
import { JwtTokenService } from "../jwt-token.service.js";

const SECRET = "test-jwt-secret-must-be-at-least-32-chars";

describe("JwtTokenService", () => {
  it("signs and verifies a token", async () => {
    const svc = new JwtTokenService(SECRET);
    const payload = {
      workspaceId: "ws_123",
      sessionId: "sess_456",
      userId: "user_789",
      fingerprint: "fp_abc",
    };

    const token = await svc.sign(payload, 3600);
    expect(typeof token).toBe("string");

    const verified = await svc.verify(token);
    expect(verified.workspaceId).toBe("ws_123");
    expect(verified.sessionId).toBe("sess_456");
    expect(verified.userId).toBe("user_789");
    expect(verified.fingerprint).toBe("fp_abc");
  });

  it("omits optional fields when not provided", async () => {
    const svc = new JwtTokenService(SECRET);
    const payload = { workspaceId: "ws_1", sessionId: "sess_2" };

    const token = await svc.sign(payload, 300);
    const verified = await svc.verify(token);

    expect(verified.userId).toBeUndefined();
    expect(verified.fingerprint).toBeUndefined();
  });

  it("rejects an expired token", async () => {
    const svc = new JwtTokenService(SECRET);
    const token = await svc.sign({ workspaceId: "ws", sessionId: "sess" }, 0);

    await new Promise((r) => setTimeout(r, 1100));
    await expect(svc.verify(token)).rejects.toThrow();
  }, 5000);

  it("rejects a token signed with a different secret", async () => {
    const svc1 = new JwtTokenService(SECRET);
    const svc2 = new JwtTokenService("different-secret-at-least-32-characters");
    const token = await svc1.sign(
      { workspaceId: "ws", sessionId: "sess" },
      3600,
    );

    await expect(svc2.verify(token)).rejects.toThrow();
  });

  it("rejects a malformed token", async () => {
    const svc = new JwtTokenService(SECRET);
    await expect(svc.verify("not.a.jwt")).rejects.toThrow();
  });

  it("rejects a token missing required fields", async () => {
    const svc = new JwtTokenService(SECRET);
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode(SECRET);

    const token = await new SignJWT({ foo: "bar" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .setIssuer("agent-toolkit")
      .sign(secret);

    await expect(svc.verify(token)).rejects.toThrow(
      "missing workspaceId or sessionId",
    );
  });
});
