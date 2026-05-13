import { describe, expect, it } from "vitest";
import { McpHttpClient } from "../http-client.js";
import { createAiRecruitmentToolRegistry } from "../ai-recruitment-tool-registry.js";

describe("McpHttpClient", () => {
  it("initializes, lists tools, and calls tools with bearer auth", async () => {
    const requests: Request[] = [];
    const client = new McpHttpClient(
      { url: "https://mcp.test", bearerToken: "token" },
      async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        const body = (await request.json()) as { method: string };
        if (body.method === "initialize") {
          return Response.json({ jsonrpc: "2.0", id: "1", result: {} });
        }
        if (body.method === "tools/list") {
          return Response.json({
            jsonrpc: "2.0",
            id: "2",
            result: {
              tools: [{ name: "search_candidates", description: "Search" }],
            },
          });
        }
        return Response.json({
          jsonrpc: "2.0",
          id: "3",
          result: { structuredContent: { candidates: [] } },
        });
      },
    );

    await expect(client.listTools()).resolves.toEqual([
      { name: "search_candidates", description: "Search" },
    ]);
    await expect(
      client.callTool("search_candidates", { query: "qa" }),
    ).resolves.toMatchObject({
      structuredContent: { candidates: [] },
    });
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer token");
  });

  it("maps ai-recruitment MCP tools into LangGraph capabilities", async () => {
    const client = new McpHttpClient(
      { url: "https://mcp.test" },
      async (input, init) => {
        const request = new Request(input, init);
        const body = (await request.json()) as { method: string };
        if (body.method === "initialize") {
          return Response.json({ jsonrpc: "2.0", id: "1", result: {} });
        }
        if (body.method === "tools/list") {
          return Response.json({
            jsonrpc: "2.0",
            id: "2",
            result: { tools: [{ name: "search_candidates" }] },
          });
        }
        return Response.json({
          jsonrpc: "2.0",
          id: "3",
          result: { structuredContent: { ok: true } },
        });
      },
    );

    const registry = await createAiRecruitmentToolRegistry(client);
    await expect(
      registry.execute({
        capability: "ai-recruitment.search_candidates",
        messages: [{ role: "user", content: "Find React candidates" }],
        userContext: {
          userId: "user_1",
          role: "widget_user",
          permissions: ["ai-recruitment.search_candidates"],
        },
        requestContext: { sessionId: "s1", requestId: "r1" },
      }),
    ).resolves.toMatchObject({
      toolName: "search_candidates",
      result: {
        status: "success",
        data: { structuredContent: { ok: true } },
      },
    });
  });
});
