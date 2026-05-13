import { beforeEach, describe, expect, it, vi } from "vitest";
import { LangGraphAdapter } from "../langgraph.adapter.js";
import type { Logger } from "../../../interfaces/logger.interface.js";

const logger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

function createSseStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });
}

describe("LangGraphAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates local LangGraph sessions", async () => {
    const adapter = new LangGraphAdapter(logger, {
      geminiApiKey: "gemini-key",
    });

    await expect(
      adapter.createSession({
        baseUrl: "https://ragflow.test",
        apiKey: "ragflow-key",
        agentId: "agent_1",
      }),
    ).resolves.toMatch(/^langgraph_/);
  });

  it("returns a clean provider error when Gemini is not configured", async () => {
    const adapter = new LangGraphAdapter(logger);

    const events = [];
    for await (const event of adapter.sendMessage(
      {
        baseUrl: "https://ragflow.test",
        apiKey: "ragflow-key",
        agentId: "agent_1",
      },
      "session_1",
      "hello",
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "error",
        code: "PROVIDER_ERROR",
        message: "LangGraph Gemini API key is not configured",
      },
    ]);
  });

  it("uses Vertex AI for LangGraph when Vertex config is provided", async () => {
    const requests: Request[] = [];
    const adapter = new LangGraphAdapter(logger, {
      geminiVertex: {
        apiKey: "vertex-key",
        project: "trial-project",
        location: "global",
      },
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.endsWith(":generateContent")) {
          return Response.json({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        route: "free_chat",
                        confidence: 0.9,
                        reason: "chat",
                      }),
                    },
                  ],
                },
              },
            ],
          });
        }
        return new Response(
          createSseStream([
            'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}\n\n',
          ]),
          { status: 200 },
        );
      },
    });

    const events = [];
    for await (const event of adapter.sendMessage(
      {
        baseUrl: "https://ragflow.test",
        apiKey: "ragflow-key",
        agentId: "agent_1",
      },
      "session_1",
      "hello",
    )) {
      events.push(event);
    }

    expect(events).toContainEqual({ type: "token", content: "Hi" });
    expect(requests[0]?.url).toContain(
      "https://aiplatform.googleapis.com/v1/projects/trial-project/locations/global/publishers/google/models/gemini-2.5-flash-lite:generateContent",
    );
    expect(requests[0]?.headers.get("x-goog-api-key")).toBe("vertex-key");
  });

  it("streams LangGraph runtime events as ChatStreamEvent values", async () => {
    const adapter = new LangGraphAdapter(logger, {
      geminiApiKey: "gemini-key",
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        if (request.url.endsWith(":generateContent")) {
          return Response.json({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        route: "knowledge_qa",
                        confidence: 0.94,
                        reason: "retrieval question",
                      }),
                    },
                  ],
                },
              },
            ],
          });
        }
        if (request.url.endsWith("/api/v1/retrieval")) {
          return Response.json({
            data: {
              chunks: [
                { content: "Policy context", document_name: "policy.md" },
              ],
            },
          });
        }
        return new Response(
          createSseStream([
            'data: {"candidates":[{"content":{"parts":[{"text":"Answer"}]}}]}\n\n',
          ]),
          { status: 200 },
        );
      },
    });

    const events = [];
    for await (const event of adapter.sendMessage(
      {
        baseUrl: "https://ragflow.test",
        apiKey: "ragflow-key",
        agentId: "agent_1",
        providerConfig: {
          model: { provider: "gemini", model: "gemini-2.5-flash-lite" },
          ragflow: {
            baseUrl: "https://ragflow.test",
            datasetIds: ["kb_1"],
          },
        },
      },
      "session_1",
      "What is policy?",
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "metadata",
        data: {
          route: "knowledge_qa",
          capability: undefined,
          retrieval: [
            {
              content: "Policy context",
              source: "policy.md",
              metadata: {
                content: "Policy context",
                document_name: "policy.md",
              },
            },
          ],
          plan: undefined,
          toolResults: [],
          references: [
            {
              id: "ref_1",
              title: "policy.md",
              source: "policy.md",
            },
          ],
          artifacts: [],
        },
      },
      { type: "token", content: "Answer" },
      { type: "done", sessionId: "session_1", providerSessionId: "session_1" },
    ]);
  });

  it("passes prior session messages into LangGraph runtime", async () => {
    const bodies: string[] = [];
    const adapter = new LangGraphAdapter(logger, {
      geminiApiKey: "gemini-key",
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        bodies.push(await request.text());
        if (request.url.endsWith(":generateContent")) {
          return Response.json({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        route: "free_chat",
                        confidence: 0.9,
                        reason: "chat",
                      }),
                    },
                  ],
                },
              },
            ],
          });
        }
        return new Response(
          createSseStream([
            'data: {"candidates":[{"content":{"parts":[{"text":"Follow-up"}]}}]}\n\n',
          ]),
          { status: 200 },
        );
      },
    });

    for await (const _event of adapter.sendMessage(
      {
        baseUrl: "https://ragflow.test",
        apiKey: "ragflow-key",
        agentId: "agent_1",
      },
      "session_1",
      "What about next?",
      {
        messages: [
          { role: "user", content: "Previous question" },
          { role: "assistant", content: "Previous answer" },
        ],
      },
    )) {
      // Consume stream.
    }

    expect(bodies.join("\n")).toContain("Previous question");
    expect(bodies.join("\n")).toContain("Previous answer");
  });

  it("skips unavailable optional MCP tools with a server warning and without stopping chat", async () => {
    const adapter = new LangGraphAdapter(logger, {
      geminiApiKey: "gemini-key",
      aiRecruitmentMcpUrl: "https://mcp.test",
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        if (request.url === "https://mcp.test/") {
          return new Response("not found", { status: 404 });
        }
        if (request.url.endsWith(":generateContent")) {
          return Response.json({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        route: "free_chat",
                        confidence: 0.9,
                        reason: "chat",
                      }),
                    },
                  ],
                },
              },
            ],
          });
        }
        return new Response(
          createSseStream([
            'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}\n\n',
          ]),
          { status: 200 },
        );
      },
    });

    const events = [];
    for await (const event of adapter.sendMessage(
      {
        baseUrl: "https://ragflow.test",
        apiKey: "ragflow-key",
        agentId: "agent_1",
      },
      "session_1",
      "hello",
    )) {
      events.push(event);
    }

    expect(events).toContainEqual({ type: "token", content: "Hi" });
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "Skipping unavailable optional LangGraph MCP tool registry",
      { error: "MCP initialize failed: 404" },
    );
  });

  it("logs external retriever warnings while keeping chat available", async () => {
    const adapter = new LangGraphAdapter(logger, {
      geminiApiKey: "gemini-key",
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        if (request.url.endsWith(":generateContent")) {
          return Response.json({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        route: "knowledge_qa",
                        confidence: 0.9,
                        reason: "knowledge question",
                      }),
                    },
                  ],
                },
              },
            ],
          });
        }
        return new Response(
          createSseStream([
            'data: {"candidates":[{"content":{"parts":[{"text":"Fallback"}]}}]}\n\n',
          ]),
          { status: 200 },
        );
      },
    });

    const events = [];
    for await (const event of adapter.sendMessage(
      {
        baseUrl: "https://ragflow.test",
        apiKey: "",
        agentId: "agent_1",
      },
      "session_1",
      "What is policy?",
    )) {
      events.push(event);
    }

    expect(events).toContainEqual({ type: "token", content: "Fallback" });
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: "error" }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "LangGraph external dependency unavailable",
      {
        dependency: "retriever",
        code: "RETRIEVER_NOT_CONFIGURED",
        message: "Knowledge retrieval is not configured",
      },
    );
  });

  it("surfaces Gemini provider failures from runtime errors", async () => {
    const adapter = new LangGraphAdapter(logger, {
      geminiApiKey: "gemini-key",
      fetchImpl: async () =>
        Response.json(
          {
            error: {
              status: "RESOURCE_EXHAUSTED",
              message: "You exceeded your current quota.",
            },
          },
          { status: 429 },
        ),
    });

    const events = [];
    for await (const event of adapter.sendMessage(
      {
        baseUrl: "https://ragflow.test",
        apiKey: "ragflow-key",
        agentId: "agent_1",
      },
      "session_1",
      "hello",
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "error",
        code: "GEMINI_PROVIDER_ERROR",
        message:
          "Gemini provider failed (429 RESOURCE_EXHAUSTED): You exceeded your current quota.",
      },
    ]);
  });
});
