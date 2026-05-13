import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AgentChatWidget } from "../AgentChatWidget.js";

const TEST_API_URL = "http://test-server";

vi.mock("../../config.js", () => ({
  getApiUrl: () => TEST_API_URL,
}));

function createSSEStream(events: Array<Record<string, unknown>>) {
  const frames = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  const encoder = new TextEncoder();
  const encoded = encoder.encode(frames);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });
}

function mockFetch() {
  const fetchMock = vi.fn();

  fetchMock.mockImplementation(async (url: string) => {
    if (typeof url === "string" && url.includes("/widget/session")) {
      return new Response(
        JSON.stringify({
          token: "test-jwt-token",
          sessionId: "sess_test",
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (typeof url === "string" && url.includes("/widget/chat")) {
      const body = createSSEStream([
        { type: "token", content: "Hello world" },
        { type: "done", sessionId: "sess_test", providerSessionId: "rf_test" },
      ]);

      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    return new Response("Not found", { status: 404 });
  });

  return fetchMock;
}

async function flushAsync(ms = 0) {
  await act(async () => {
    if (ms > 0) await vi.advanceTimersByTimeAsync(ms);
    else await vi.advanceTimersByTimeAsync(0);
  });
}

describe("AgentChatWidget — typewriter integration", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    vi.useFakeTimers();
    originalFetch = globalThis.fetch;
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock;
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("renders and creates a session on mount", async () => {
    render(<AgentChatWidget workspaceId="ws_test" />);

    await flushAsync(100);

    expect(fetchMock).toHaveBeenCalledWith(
      `${TEST_API_URL}/widget/session`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("input is enabled after session is ready", async () => {
    render(<AgentChatWidget workspaceId="ws_test" initialOpen />);

    await flushAsync(100);

    const input = screen.getByLabelText(
      "Chat message input",
    ) as HTMLTextAreaElement;
    expect(input.disabled).toBe(false);
  });

  it("shows assistant message content progressively via typewriter", async () => {
    render(<AgentChatWidget workspaceId="ws_test" initialOpen />);
    await flushAsync(100);

    const input = screen.getByLabelText(
      "Chat message input",
    ) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "hi" } });

    const sendButton = screen.getByLabelText("Send message");
    fireEvent.click(sendButton);

    // Flush fetch + SSE parsing + first React render cycle
    await flushAsync(50);

    // After fetch completes, content "Hello world" (11 chars) is set on the message.
    // useTypingEffect animates — at default 4 chars/25ms, after 50ms we should have ~8 chars.
    await flushAsync(100);

    const markdownEls = document.querySelectorAll(".rcw-markdown");
    const lastMarkdown = markdownEls[markdownEls.length - 1];

    if (lastMarkdown) {
      const partialText = lastMarkdown.textContent ?? "";
      expect(partialText.length).toBeGreaterThan(0);
    }

    // Advance enough for full reveal (11 chars / 4 per tick * 25ms = 75ms, plus buffer)
    await flushAsync(400);

    const finalMarkdownEls = document.querySelectorAll(".rcw-markdown");
    const finalMarkdown = finalMarkdownEls[finalMarkdownEls.length - 1];
    expect(finalMarkdown?.textContent).toBe("Hello world");
  });

  it("input becomes enabled after typewriter animation completes", async () => {
    render(<AgentChatWidget workspaceId="ws_test" initialOpen />);
    await flushAsync(100);

    const input = screen.getByLabelText(
      "Chat message input",
    ) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "hi" } });
    fireEvent.click(screen.getByLabelText("Send message"));

    // Flush fetch completion + initial render
    await flushAsync(0);
    await flushAsync(0);

    // Advance past full typewriter animation (11 chars / 4 per tick * 25ms = 75ms, plus buffer)
    await flushAsync(200);

    expect(input.disabled).toBe(false);
  });

  it("input stays disabled while typewriter is animating after server response completes", async () => {
    // Long content so typewriter animation (ceil(80/4)*25ms = 500ms) outlasts the fetch.
    const longContent =
      "The quick brown fox jumps over the lazy dog. Here is some additional padding text.";
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/widget/session")) {
        return new Response(
          JSON.stringify({
            token: "test-jwt-token",
            sessionId: "sess_test",
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (typeof url === "string" && url.includes("/widget/chat")) {
        const body = createSSEStream([
          { type: "token", content: longContent },
          {
            type: "done",
            sessionId: "sess_test",
            providerSessionId: "rf_test",
          },
        ]);
        return new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return new Response("Not found", { status: 404 });
    });

    render(<AgentChatWidget workspaceId="ws_test" initialOpen />);
    await flushAsync(100);

    const input = screen.getByLabelText(
      "Chat message input",
    ) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "hi" } });
    fireEvent.click(screen.getByLabelText("Send message"));

    // Flush fetch (completes instantly with mock) + first render
    await flushAsync(0);
    await flushAsync(50);

    // Server response is complete (isLoading=false), but typewriter still animating → input disabled
    expect(input.disabled).toBe(true);

    // Advance past full typewriter animation (80 chars / 4 per tick * 25ms = 500ms)
    await flushAsync(600);

    expect(input.disabled).toBe(false);
  });

  it("does not re-animate last message after close and reopen", async () => {
    render(<AgentChatWidget workspaceId="ws_test" initialOpen />);
    await flushAsync(100);

    // Send a message and wait for typewriter to complete
    const input = screen.getByLabelText(
      "Chat message input",
    ) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "hi" } });
    fireEvent.click(screen.getByLabelText("Send message"));
    await flushAsync(0);
    await flushAsync(0);
    await flushAsync(200);

    // Verify animation completed — full text visible
    const markdownEls = document.querySelectorAll(".rcw-markdown");
    const lastMd = markdownEls[markdownEls.length - 1];
    expect(lastMd?.textContent).toBe("Hello world");

    // Close the widget via the bubble toggle button
    const bubbleBtn = screen.getByRole("button", {
      name: "Close chat",
      expanded: true,
    });
    fireEvent.click(bubbleBtn);
    await flushAsync(0);

    // Reopen the widget
    fireEvent.click(screen.getByLabelText("Open chat"));
    await flushAsync(0);

    // The last assistant message should show full text immediately (no re-animation)
    const reopenedEls = document.querySelectorAll(".rcw-markdown");
    const reopenedMd = reopenedEls[reopenedEls.length - 1];
    expect(reopenedMd?.textContent).toBe("Hello world");
  });
});
