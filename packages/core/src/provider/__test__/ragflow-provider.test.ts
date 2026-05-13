import { describe, expect, it, vi } from "vitest";
import {
  buildRagflowAgentUrl,
  createRagflowSessionRequest,
  testRagflowSessionEndpoint,
} from "../../index.js";

describe("RAGFlow provider helpers", () => {
  it("builds production session and completion URLs", () => {
    expect(
      buildRagflowAgentUrl("https://ragflow.test///", "agent 1", "sessions"),
    ).toBe("https://ragflow.test/api/v1/agents/agent%201/sessions");
    expect(
      buildRagflowAgentUrl("https://ragflow.test", "agent_1", "completions"),
    ).toBe("https://ragflow.test/api/v1/agents/agent_1/completions");
  });

  it("creates an authenticated session request", () => {
    expect(
      createRagflowSessionRequest({
        baseUrl: "https://ragflow.test",
        agentId: "agent_1",
        apiKey: "secret",
      }),
    ).toEqual({
      url: "https://ragflow.test/api/v1/agents/agent_1/sessions",
      init: {
        method: "POST",
        headers: {
          Authorization: "Bearer secret",
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    });
  });

  it("reports provider health from the real session endpoint", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", {
        status: 201,
      }),
    );

    await expect(
      testRagflowSessionEndpoint(
        {
          baseUrl: "https://ragflow.test",
          agentId: "agent_1",
          apiKey: "secret",
        },
        fetchImpl,
      ),
    ).resolves.toEqual({
      ok: true,
      url: "https://ragflow.test/api/v1/agents/agent_1/sessions",
      status: 201,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://ragflow.test/api/v1/agents/agent_1/sessions",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
