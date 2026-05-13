import type { ChatStreamEvent } from "@agent-toolkit/types";
import type { RuntimeMessage } from "@agent-toolkit/langgraph";

export interface ChatProviderConfig {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  providerConfig?: Record<string, unknown>;
}

export interface ChatProvider {
  /** Create a new conversation session with the provider, returns provider-specific session ID. */
  createSession(config: ChatProviderConfig): Promise<string>;

  /** Send a message and receive a streaming response as an async generator. */
  sendMessage(
    config: ChatProviderConfig,
    sessionId: string,
    message: string,
    context?: ChatProviderMessageContext,
  ): AsyncGenerator<ChatStreamEvent, void, undefined>;
}

export interface ChatProviderMessageContext {
  messages: RuntimeMessage[];
  memorySummary?: string;
}
