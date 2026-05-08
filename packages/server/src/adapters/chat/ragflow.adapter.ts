import type { ChatStreamEvent } from "@agent-toolkit/types";
import {
  buildRagflowAgentUrl,
  createRagflowSessionRequest,
} from "@agent-toolkit/core";
import type {
  ChatProvider,
  ChatProviderConfig,
} from "../../interfaces/chat-provider.interface.js";
import type { Logger } from "../../interfaces/logger.interface.js";

export class RagflowAdapter implements ChatProvider {
  constructor(private readonly logger: Logger) {}

  async createSession(config: ChatProviderConfig): Promise<string> {
    const request = createRagflowSessionRequest(config);

    const response = await fetch(request.url, request.init);

    if (!response.ok) {
      const body = await response.text().catch(() => "unknown");
      this.logger.error("RAGFlow session creation failed", {
        status: response.status,
        body,
      });
      throw new Error(`Provider session creation failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      data?: { id?: string };
    };
    const sessionId = data.data?.id;

    if (!sessionId) {
      throw new Error("Provider returned no session ID");
    }

    return sessionId;
  }

  async *sendMessage(
    config: ChatProviderConfig,
    sessionId: string,
    message: string,
  ): AsyncGenerator<ChatStreamEvent, void, undefined> {
    const url = buildRagflowAgentUrl(
      config.baseUrl,
      config.agentId,
      "completions",
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: message,
        session_id: sessionId,
        stream: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "unknown");
      this.logger.error("RAGFlow completion failed", {
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
    let previousAnswer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const parsed = this.parseSSEEvent(event, previousAnswer);
          if (parsed) {
            if (parsed.type === "token") previousAnswer += parsed.content;
            yield parsed;
          }
        }
      }

      if (buffer.trim()) {
        const parsed = this.parseSSEEvent(buffer, previousAnswer);
        if (parsed) yield parsed;
      }

      yield { type: "done", sessionId, providerSessionId: sessionId };
    } catch (err) {
      this.logger.error("SSE stream error", {
        error: err instanceof Error ? err.message : String(err),
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

  private parseSSEEvent(
    raw: string,
    previousAnswer: string,
  ): ChatStreamEvent | null {
    const lines = raw.split("\n");
    let data = "";

    for (const line of lines) {
      if (line.startsWith("data:")) {
        data += line.slice(5).trimStart();
      }
    }

    if (!data || data === "[DONE]") return null;
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;

      if (parsed["code"] !== undefined && parsed["code"] !== 0) {
        return {
          type: "error",
          code: "PROVIDER_ERROR",
          message: String(parsed["message"] ?? "Provider error"),
        };
      }

      const answer = parsed["data"] as Record<string, unknown> | undefined;
      const content =
        (answer?.["answer"] as string) ?? (answer?.["content"] as string);

      if (typeof content === "string" && content.length > 0) {
        // RAGFlow sends cumulative answers — extract only the new delta
        const delta = content.startsWith(previousAnswer)
          ? content.slice(previousAnswer.length)
          : content;
        if (delta.length > 0) {
          return { type: "token", content: delta };
        }
        return null;
      }

      return null;
    } catch {
      if (data.trim().length > 0) {
        return { type: "token", content: data };
      }
      return null;
    }
  }
}
