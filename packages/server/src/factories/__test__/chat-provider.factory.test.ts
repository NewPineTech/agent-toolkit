import { beforeEach, describe, it, expect, vi } from "vitest";
import { ChatProviderFactory } from "../chat-provider.factory.js";
import { ProviderType, AuthMode } from "@agent-toolkit/types";
import type { Workspace } from "@agent-toolkit/types";
import type { EncryptionService } from "../../interfaces/encryption-service.interface.js";
import type { Logger } from "../../interfaces/logger.interface.js";

const mockEncryption: EncryptionService = {
  encrypt: vi.fn((v) => `enc_${v}`),
  decrypt: vi.fn((v) => v.replace("enc_", "")),
};

const mockLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

const workspace: Workspace = {
  id: "ws_1",
  providerType: ProviderType.RAGFLOW,
  providerAgentId: "agent_1",
  providerApiKey: "enc_sk-secret",
  providerBaseUrl: "https://ragflow.test",
  providerConfig: {},
  allowedDomains: ["https://example.com"],
  authMode: AuthMode.ANONYMOUS,
  authSecret: null,
  rateLimitConfig: { maxRequests: 30, windowMs: 60000 },
  maxMessageLength: 4000,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("ChatProviderFactory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a provider and config for ragflow workspace", () => {
    const factory = new ChatProviderFactory(mockEncryption, mockLogger);
    const { provider, config } = factory.create(workspace);

    expect(provider).toBeDefined();
    expect(config.baseUrl).toBe("https://ragflow.test");
    expect(config.apiKey).toBe("sk-secret");
    expect(config.agentId).toBe("agent_1");
    expect(mockEncryption.decrypt).toHaveBeenCalledWith("enc_sk-secret");
  });

  it("caches adapter instances by provider type", () => {
    const factory = new ChatProviderFactory(mockEncryption, mockLogger);
    const { provider: p1 } = factory.create(workspace);
    const { provider: p2 } = factory.create({
      ...workspace,
      id: "ws_2",
      providerApiKey: "enc_other",
    });

    expect(p1).toBe(p2);
  });

  it("creates a provider and config for langgraph workspace", () => {
    const factory = new ChatProviderFactory(mockEncryption, mockLogger, {
      geminiApiKey: "gemini-key",
    });
    const { provider, config } = factory.create({
      ...workspace,
      providerType: ProviderType.LANGGRAPH,
      providerConfig: {
        model: { provider: "gemini", model: "gemini-2.5-flash-lite" },
        ragflow: {
          baseUrl: "https://ragflow.test",
          datasetIds: ["kb_1"],
        },
      },
    });

    expect(provider).toBeDefined();
    expect(config.baseUrl).toBe("https://ragflow.test");
    expect(config.apiKey).toBe("sk-secret");
    expect(config.providerConfig).toEqual({
      model: { provider: "gemini", model: "gemini-2.5-flash-lite" },
      ragflow: {
        baseUrl: "https://ragflow.test",
        datasetIds: ["kb_1"],
      },
    });
  });

  it("does not decrypt provider API key for LangGraph without RAGFlow retrieval", () => {
    const decrypt = vi.fn(() => {
      throw new Error("invalid encrypted key");
    });
    const factory = new ChatProviderFactory(
      { ...mockEncryption, decrypt },
      mockLogger,
      {
        geminiApiKey: "gemini-key",
      },
    );

    const { provider, config } = factory.create({
      ...workspace,
      providerType: ProviderType.LANGGRAPH,
      providerApiKey: "legacy-or-dummy-value",
      providerConfig: {},
    });

    expect(provider).toBeDefined();
    expect(config.apiKey).toBe("");
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("throws for unsupported provider type", () => {
    const factory = new ChatProviderFactory(mockEncryption, mockLogger);
    expect(() =>
      factory.create({
        ...workspace,
        providerType: "unknown" as ProviderType,
      }),
    ).toThrow("Unsupported provider type");
  });
});
