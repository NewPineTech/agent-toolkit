import { describe, it, expect, vi, beforeEach } from "vitest";
import { LangGraphAdapter } from "./langgraph.adapter.js";
import type { Logger } from "../../interfaces/logger.interface.js";
import type { ChatProviderConfig } from "../../interfaces/chat-provider.interface.js";

const logger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

const config: ChatProviderConfig = {
  baseUrl: "https://langgraph.test/",
  apiKey: "lg-secret",
  agentId: "hr_assistant",
};

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("LangGraphAdapter", () => {
  let adapter: LangGraphAdapter;

  beforeEach(() => {
    adapter = new LangGraphAdapter(logger);
    vi.restoreAllMocks();
  });

  it("creates a local provider session id", async () => {
    await expect(adapter.createSession(config)).resolves.toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it("posts to /chat and maps provider SSE events", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        sseStream([
          'data: {"type":"token","content":"Hello"}\n\n',
          'data: {"type":"done","sessionId":"sess_1","providerSessionId":"sess_1"}\n\n',
        ]),
        { status: 200 },
      ),
    );

    const events = [];
    for await (const event of adapter.sendMessage(config, "sess_1", "hi")) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "token", content: "Hello" },
      { type: "done", sessionId: "sess_1", providerSessionId: "sess_1" },
    ]);
    const call = vi.mocked(fetch).mock.calls[0]!;
    expect(call[0]).toBe("https://langgraph.test/chat");
    expect((call[1]!.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer lg-secret",
    );
    expect(JSON.parse(call[1]!.body as string)).toEqual({
      threadId: "sess_1",
      message: "hi",
    });
  });

  it("adds done when provider stream omits it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        sseStream(['data: {"type":"token","content":"Hello"}\n\n']),
        { status: 200 },
      ),
    );

    const events = [];
    for await (const event of adapter.sendMessage(config, "sess_2", "hi")) {
      events.push(event);
    }

    expect(events.at(-1)).toEqual({
      type: "done",
      sessionId: "sess_2",
      providerSessionId: "sess_2",
    });
  });

  it("yields provider error on non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("failed", { status: 500 }),
    );

    const events = [];
    for await (const event of adapter.sendMessage(config, "sess_3", "hi")) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "error",
        code: "PROVIDER_ERROR",
        message: "Failed to get response from provider",
      },
    ]);
  });
});
