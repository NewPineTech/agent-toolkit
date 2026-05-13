import { describe, it, expect } from "vitest";
import { WorkspaceFactory } from "../workspace.factory.js";

const factory = new WorkspaceFactory();

const now = new Date();
const mockRow = {
  id: "ws_1",
  providerType: "ragflow",
  providerAgentId: "agent_1",
  providerApiKey: "enc_key",
  providerBaseUrl: "https://ragflow.test",
  allowedDomains: ["https://example.com"],
  authMode: "anonymous",
  authSecret: null,
  rateLimitConfig: { maxRequests: 30, windowMs: 60000 },
  maxMessageLength: 4000,
  createdAt: now,
  updatedAt: now,
};

describe("WorkspaceFactory", () => {
  it("converts a DB row to a Workspace domain object", () => {
    const workspace = factory.fromRow(mockRow as any);

    expect(workspace.id).toBe("ws_1");
    expect(workspace.providerType).toBe("ragflow");
    expect(workspace.providerAgentId).toBe("agent_1");
    expect(workspace.providerApiKey).toBe("enc_key");
    expect(workspace.providerBaseUrl).toBe("https://ragflow.test");
    expect(workspace.allowedDomains).toEqual(["https://example.com"]);
    expect(workspace.authMode).toBe("anonymous");
    expect(workspace.authSecret).toBeNull();
    expect(workspace.rateLimitConfig).toEqual({
      maxRequests: 30,
      windowMs: 60000,
    });
    expect(workspace.maxMessageLength).toBe(4000);
    expect(workspace.createdAt).toBe(now);
    expect(workspace.updatedAt).toBe(now);
  });

  it("preserves authenticated auth mode", () => {
    const workspace = factory.fromRow({
      ...mockRow,
      authMode: "authenticated",
      authSecret: "hmac_secret",
    } as any);

    expect(workspace.authMode).toBe("authenticated");
    expect(workspace.authSecret).toBe("hmac_secret");
  });

  it("handles multiple allowed domains", () => {
    const workspace = factory.fromRow({
      ...mockRow,
      allowedDomains: ["https://a.com", "*.b.com", "https://c.com"],
    } as any);

    expect(workspace.allowedDomains).toHaveLength(3);
  });
});
