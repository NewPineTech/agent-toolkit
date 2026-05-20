import { randomUUID } from "node:crypto";
import type { ChatStreamEvent } from "@agent-toolkit/types";
import type {
  ChatProvider,
  ChatProviderConfig,
} from "../../interfaces/chat-provider.interface.js";
import type { Logger } from "../../interfaces/logger.interface.js";

export class LangGraphAdapter implements ChatProvider {
  constructor(private readonly logger: Logger) {}

  async createSession(_config: ChatProviderConfig): Promise<string> {
    return randomUUID();
  }

  async *sendMessage(
    config: ChatProviderConfig,
    sessionId: string,
    message: string,
  ): AsyncGenerator<ChatStreamEvent, void, undefined> {
    const response = await fetch(buildChatUrl(config.baseUrl), {
      method: "POST",
      headers: buildHeaders(config.apiKey),
      body: JSON.stringify({
        threadId: sessionId,
        message,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "unknown");
      this.logger.error("LangGraph chat request failed", {
        status: response.status,
        body,
      });
      yield {
        type: "error",
        code: "PROVIDER_ERROR",
        message: "Failed to get response from provider",
      };
      return;
    }

    if (!response.body) {
      yield {
        type: "error",
        code: "STREAM_ERROR",
        message: "No response body from provider",
      };
      return;
    }

    yield* this.parseSSEStream(response.body, sessionId);
  }

  private async *parseSSEStream(
    body: ReadableStream<Uint8Array>,
    sessionId: string,
  ): AsyncGenerator<ChatStreamEvent, void, undefined> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawDone = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const parsed = this.parseSSEEvent(event);
          if (!parsed) continue;
          if (parsed.type === "done") sawDone = true;
          yield parsed;
        }
      }

      if (buffer.trim()) {
        const parsed = this.parseSSEEvent(buffer);
        if (parsed) {
          if (parsed.type === "done") sawDone = true;
          yield parsed;
        }
      }

      if (!sawDone) {
        yield { type: "done", sessionId, providerSessionId: sessionId };
      }
    } catch (error) {
      this.logger.error("LangGraph SSE stream error", {
        error: error instanceof Error ? error.message : String(error),
      });
      yield {
        type: "error",
        code: "STREAM_ERROR",
        message: "Stream interrupted",
      };
    } finally {
      reader.releaseLock();
    }
  }

  private parseSSEEvent(raw: string): ChatStreamEvent | null {
    const data = raw
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("");

    if (!data || data === "[DONE]") return null;

    try {
      const parsed = JSON.parse(data) as unknown;
      if (isChatStreamEvent(parsed)) return parsed;
      return {
        type: "error",
        code: "PROVIDER_ERROR",
        message: "Invalid LangGraph stream event",
      };
    } catch {
      return { type: "token", content: data };
    }
  }
}

function buildChatUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat`;
}

function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey.trim()) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  return headers;
}

function isChatStreamEvent(value: unknown): value is ChatStreamEvent {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  const event = value as { type: unknown };
  return (
    event.type === "token" ||
    event.type === "done" ||
    event.type === "error" ||
    event.type === "metadata"
  );
}
