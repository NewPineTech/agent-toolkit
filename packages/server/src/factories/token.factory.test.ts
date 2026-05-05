import { describe, it, expect, vi, beforeEach } from "vitest";
import { TokenFactory } from "./token.factory.js";
import type { TokenService } from "../interfaces/token-service.interface.js";

const mockTokenService: TokenService = {
  sign: vi.fn().mockResolvedValue("jwt_token_123"),
  verify: vi.fn(),
};

describe("TokenFactory", () => {
  let factory: TokenFactory;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(mockTokenService.sign).mockResolvedValue("jwt_token_123");
    factory = new TokenFactory(mockTokenService);
  });

  it("creates a session token with correct payload", async () => {
    const result = await factory.createSessionToken({
      workspaceId: "ws_1",
      sessionId: "sess_1",
      ttlSeconds: 1800,
      userId: "user_1",
      fingerprint: "fp_1",
    });

    expect(result.token).toBe("jwt_token_123");
    expect(result.expiresAt).toBeInstanceOf(Date);

    expect(mockTokenService.sign).toHaveBeenCalledWith(
      {
        workspaceId: "ws_1",
        sessionId: "sess_1",
        userId: "user_1",
        fingerprint: "fp_1",
      },
      1800,
    );
  });

  it("calculates expiresAt from ttlSeconds", async () => {
    const before = Date.now();
    const result = await factory.createSessionToken({
      workspaceId: "ws",
      sessionId: "sess",
      ttlSeconds: 3600,
    });
    const after = Date.now();

    const expiresMs = result.expiresAt.getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + 3600_000);
    expect(expiresMs).toBeLessThanOrEqual(after + 3600_000);
  });

  it("passes undefined for optional fields", async () => {
    await factory.createSessionToken({
      workspaceId: "ws",
      sessionId: "sess",
      ttlSeconds: 300,
    });

    expect(mockTokenService.sign).toHaveBeenCalledWith(
      {
        workspaceId: "ws",
        sessionId: "sess",
        userId: undefined,
        fingerprint: undefined,
      },
      300,
    );
  });
});
