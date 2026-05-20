import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { hrAssistantGraph } from "../graph.js";

interface ChatRequestBody {
  threadId?: string;
  message?: string;
}

const MAX_CHAT_BODY_BYTES = 64 * 1024;

export async function handleChatRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody(request);
    const message = body.message?.trim();
    const threadId = body.threadId?.trim() || randomUUID();

    writeSseHeaders(response);

    if (!message) {
      writeSse(response, {
        type: "error",
        code: "VALIDATION_ERROR",
        message: "Message is required",
      });
      response.end();
      return;
    }

    writeSse(response, {
      type: "metadata",
      data: { threadId },
    });

    const result = await hrAssistantGraph.invoke(
      { message },
      { configurable: { thread_id: threadId } },
    );

    if (result.finalAnswer) {
      writeSse(response, { type: "token", content: result.finalAnswer });
    }

    for (const warning of result.warnings ?? []) {
      writeSse(response, { type: "metadata", data: { warning } });
    }

    writeSse(response, {
      type: "done",
      sessionId: threadId,
      providerSessionId: threadId,
    });
  } catch (error) {
    if (!response.headersSent) writeSseHeaders(response);
    writeSse(response, {
      type: "error",
      code: "STREAM_ERROR",
      message: error instanceof Error ? error.message : "Stream interrupted",
    });
  } finally {
    response.end();
  }
}

function writeSseHeaders(response: ServerResponse): void {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
}

function writeSse(response: ServerResponse, event: unknown): void {
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function readJsonBody(
  request: IncomingMessage,
): Promise<ChatRequestBody> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_CHAT_BODY_BYTES) {
      throw new Error("Chat request body is too large");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as ChatRequestBody;
}
