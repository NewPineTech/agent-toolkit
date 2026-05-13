import { describe, expect, it } from "vitest";
import {
  GeminiChatModelClient,
  GeminiVertexChatModelClient,
} from "../gemini.client.js";

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

describe("GeminiChatModelClient", () => {
  it("classifies runtime routes through Gemini without leaking the API key in the URL", async () => {
    const requests: Request[] = [];
    const client = new GeminiChatModelClient(
      { apiKey: "gemini-key" },
      async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      route: "tool_action",
                      capability: "workspace.update",
                      confidence: 0.86,
                      reason: "User asked to update workspace settings",
                    }),
                  },
                ],
              },
            },
          ],
        });
      },
    );

    const decision = await client.classifyRoute({
      messages: [{ role: "user", content: "Change workspace domains" }],
      userContext: {
        userId: "user_1",
        role: "admin",
        permissions: ["workspace.update"],
      },
      requestContext: {
        sessionId: "session_1",
        requestId: "request_1",
      },
    });

    expect(decision).toEqual({
      route: "tool_action",
      capability: "workspace.update",
      confidence: 0.86,
      reason: "User asked to update workspace settings",
    });
    expect(requests[0]?.url).toContain(
      "/v1beta/models/gemini-2.5-flash-lite:generateContent",
    );
    expect(requests[0]?.url).not.toContain("gemini-key");
    expect(requests[0]?.headers.get("x-goog-api-key")).toBe("gemini-key");
  });

  it("streams text chunks with the API key in the x-goog-api-key header", async () => {
    const requests: Request[] = [];
    const client = new GeminiChatModelClient(
      { apiKey: "gemini-key" },
      async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(
          createSseStream([
            'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\n\n',
            'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]}}]}\n\n',
          ]),
          { status: 200 },
        );
      },
    );

    const chunks = [];
    for await (const chunk of client.streamText({
      messages: [{ role: "user", content: "Hi" }],
      contexts: [{ content: "Policy context", source: "policy.md" }],
      routeDecision: {
        route: "knowledge_qa",
        confidence: 0.9,
        reason: "test",
      },
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hel", "lo"]);
    expect(requests[0]?.url).toContain(
      "/v1beta/models/gemini-2.5-flash-lite:streamGenerateContent?alt=sse",
    );
    expect(requests[0]?.url).not.toContain("gemini-key");
    expect(requests[0]?.headers.get("x-goog-api-key")).toBe("gemini-key");
  });

  it("streams text chunks from CRLF-delimited Gemini SSE events", async () => {
    const client = new GeminiChatModelClient(
      { apiKey: "gemini-key" },
      async () =>
        new Response(
          createSseStream([
            'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\r\n\r\n',
            'data: {"candidates":[{"content":{"parts":[{"text":" there"}]}}]}\r\n\r\n',
          ]),
          { status: 200 },
        ),
    );

    const chunks = [];
    for await (const chunk of client.streamText({
      messages: [{ role: "user", content: "Hi" }],
      contexts: [],
      routeDecision: {
        route: "free_chat",
        confidence: 0.9,
        reason: "test",
      },
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hello", " there"]);
  });

  it("throws a provider error when Gemini returns non-OK", async () => {
    const client = new GeminiChatModelClient(
      { apiKey: "gemini-key" },
      async () => new Response("bad", { status: 503 }),
    );

    await expect(async () => {
      for await (const _chunk of client.streamText({
        messages: [{ role: "user", content: "Hi" }],
        contexts: [],
        routeDecision: {
          route: "knowledge_qa",
          confidence: 0.9,
          reason: "test",
        },
      })) {
        // Iteration forces the async generator to execute.
      }
    }).rejects.toThrow("Gemini generation failed: 503");
  });

  it("surfaces Gemini quota failures during route classification", async () => {
    const client = new GeminiChatModelClient(
      { apiKey: "gemini-key" },
      async () =>
        Response.json(
          {
            error: {
              code: 429,
              status: "RESOURCE_EXHAUSTED",
              message:
                "You exceeded your current quota, please check your plan and billing details.",
            },
          },
          { status: 429 },
        ),
    );

    await expect(
      client.classifyRoute({
        messages: [{ role: "user", content: "hello" }],
        userContext: {
          userId: "user_1",
          role: "widget_user",
          permissions: ["docs:read"],
        },
        requestContext: {
          sessionId: "session_1",
          requestId: "request_1",
        },
      }),
    ).rejects.toThrow(
      "Gemini provider failed (429 RESOURCE_EXHAUSTED): You exceeded your current quota, please check your plan and billing details.",
    );
  });
});

describe("GeminiVertexChatModelClient", () => {
  it("classifies routes through Vertex AI using project and location scoped endpoints", async () => {
    const requests: Request[] = [];
    const client = new GeminiVertexChatModelClient(
      {
        apiKey: "vertex-key",
        project: "trial-project",
        location: "us-central1",
      },
      async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      route: "free_chat",
                      confidence: 0.8,
                      reason: "chat",
                    }),
                  },
                ],
              },
            },
          ],
        });
      },
    );

    const decision = await client.classifyRoute({
      messages: [{ role: "user", content: "hello" }],
      userContext: {
        userId: "user_1",
        role: "widget_user",
        permissions: ["docs:read"],
      },
      requestContext: {
        sessionId: "session_1",
        requestId: "request_1",
      },
    });

    expect(decision.route).toBe("free_chat");
    expect(requests[0]?.url).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/trial-project/locations/us-central1/publishers/google/models/gemini-2.5-flash-lite:generateContent",
    );
    expect(requests[0]?.url).not.toContain("vertex-key");
    expect(requests[0]?.headers.get("x-goog-api-key")).toBe("vertex-key");
  });

  it("streams content from Vertex AI through the streaming endpoint", async () => {
    const requests: Request[] = [];
    const client = new GeminiVertexChatModelClient(
      {
        apiKey: "vertex-key",
        project: "trial-project",
        location: "global",
      },
      async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(
          createSseStream([
            'data: {"candidates":[{"content":{"parts":[{"text":"Vertex"}]}}]}\n\n',
          ]),
          { status: 200 },
        );
      },
    );

    const chunks = [];
    for await (const chunk of client.streamText({
      messages: [{ role: "user", content: "Hi" }],
      contexts: [],
      routeDecision: {
        route: "free_chat",
        confidence: 0.9,
        reason: "test",
      },
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Vertex"]);
    expect(requests[0]?.url).toBe(
      "https://aiplatform.googleapis.com/v1/projects/trial-project/locations/global/publishers/google/models/gemini-2.5-flash-lite:streamGenerateContent?alt=sse",
    );
  });
});
