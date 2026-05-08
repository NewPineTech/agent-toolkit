import type { CliContext } from "../context.js";
import { writeLine } from "../context.js";
import { buildOriginHeaders, normalizeApiUrl } from "./shared.js";

interface ChatOptions {
  apiUrl: string;
  origin?: string;
}

interface SessionResponse {
  token: string;
  sessionId: string;
  expiresAt: string;
}

export async function runChatSessionCreate(
  context: CliContext,
  workspaceId: string,
  options: ChatOptions,
) {
  const session = await createSession(workspaceId, options);
  writeLine(context, JSON.stringify(session, null, 2));
}

export async function runChatAsk(
  context: CliContext,
  workspaceId: string,
  message: string,
  options: ChatOptions,
) {
  const session = await createSession(workspaceId, options);
  const response = await fetch(
    `${normalizeApiUrl(options.apiUrl)}/widget/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
        ...buildOriginHeaders(options.origin),
      },
      body: JSON.stringify({ message, sessionId: session.sessionId }),
    },
  );
  if (!response.ok || !response.body) {
    throw new Error(
      `Chat failed with HTTP ${response.status}: ${await response.text()}`,
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame
        .split("\n")
        .find((entry) => entry.startsWith("data: "));
      if (!line) continue;
      const event = JSON.parse(line.slice(6)) as {
        type?: string;
        content?: string;
        message?: string;
      };
      if (event.type === "token" && event.content)
        context.stdout(event.content);
      if (event.type === "error")
        throw new Error(event.message ?? "Stream error");
    }
  }
  writeLine(context);
}

async function createSession(
  workspaceId: string,
  options: ChatOptions,
): Promise<SessionResponse> {
  const response = await fetch(
    `${normalizeApiUrl(options.apiUrl)}/widget/session`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildOriginHeaders(options.origin),
      },
      body: JSON.stringify({ workspaceId }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Session creation failed with HTTP ${response.status}: ${await response.text()}`,
    );
  }
  return (await response.json()) as SessionResponse;
}
