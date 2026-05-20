import { useState, useCallback, useRef, useEffect } from "react";
import type { ChatStreamEvent, SessionResponse } from "@agent-toolkit/types";
import { getApiUrl } from "../config.js";

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface UseAgentChatOptions {
  workspaceId: string;
  user?: { id: string; name?: string; email?: string };
  onError?: (error: Error) => void;
}

export interface UseAgentChatReturn {
  messages: Message[];
  sendMessage: (text: string) => void;
  isLoading: boolean;
  error: Error | null;
  resetSession: () => void;
  isReady: boolean;
}

const SESSION_STORAGE_KEY = "agent_chat_session";
const HISTORY_STORAGE_KEY = "agent_chat_history";
const MAX_STORED_MESSAGES = 100;

type StoredMessage = Omit<Message, "timestamp"> & { timestamp: string };

function getSessionStorageKey(workspaceId: string): string {
  return `${SESSION_STORAGE_KEY}:${workspaceId}`;
}

function getHistoryStorageKey(sessionId: string): string {
  return `${HISTORY_STORAGE_KEY}:${sessionId}`;
}

function parseStoredMessages(raw: string | null): Message[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StoredMessage[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (message): message is StoredMessage =>
          typeof message?.id === "string" &&
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string" &&
          typeof message.timestamp === "string",
      )
      .map((message) => ({
        ...message,
        timestamp: new Date(message.timestamp),
      }))
      .filter((message) => Number.isFinite(message.timestamp.getTime()));
  } catch {
    return [];
  }
}

function persistMessages(sessionId: string, messages: Message[]): void {
  const messagesToStore = messages
    .filter((message) => message.content.length > 0)
    .slice(-MAX_STORED_MESSAGES);

  const key = getHistoryStorageKey(sessionId);
  if (messagesToStore.length === 0) {
    localStorage.removeItem(key);
    return;
  }

  const stored: StoredMessage[] = messagesToStore.map((message) => ({
    ...message,
    timestamp: message.timestamp.toISOString(),
  }));
  try {
    localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // History is a recoverable client-side cache; quota/storage failures must not break chat.
  }
}

export function useAgentChat(options: UseAgentChatOptions): UseAgentChatReturn {
  const { workspaceId, onError } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isReady, setIsReady] = useState(false);

  const tokenRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const initSession = useCallback(async () => {
    try {
      const sessionStorageKey = getSessionStorageKey(workspaceId);
      const stored = localStorage.getItem(sessionStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as {
          token: string;
          sessionId: string;
          expiresAt: string;
        };
        if (new Date(parsed.expiresAt) > new Date()) {
          tokenRef.current = parsed.token;
          sessionIdRef.current = parsed.sessionId;
          setMessages(
            parseStoredMessages(
              localStorage.getItem(getHistoryStorageKey(parsed.sessionId)),
            ),
          );
          setIsReady(true);
          return;
        }
        localStorage.removeItem(sessionStorageKey);
        localStorage.removeItem(getHistoryStorageKey(parsed.sessionId));
      }

      const response = await fetch(`${getApiUrl()}/widget/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });

      if (!response.ok) {
        throw new Error(`Session creation failed: ${response.status}`);
      }

      const data = (await response.json()) as SessionResponse;
      tokenRef.current = data.token;
      sessionIdRef.current = data.sessionId;
      setMessages([]);

      localStorage.setItem(sessionStorageKey, JSON.stringify(data));

      setIsReady(true);
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Session init failed");
      setError(error);
      onErrorRef.current?.(error);
    }
  }, [workspaceId]);

  useEffect(() => {
    void initSession();
    return () => {
      abortRef.current?.abort();
    };
  }, [initSession]);

  useEffect(() => {
    if (!sessionIdRef.current) return;
    persistMessages(sessionIdRef.current, messages);
  }, [messages]);

  const sendMessage = useCallback(
    (text: string) => {
      if (!tokenRef.current || !sessionIdRef.current || isLoading) return;

      const userMessage: Message = {
        id: `msg_${generateId()}`,
        role: "user",
        content: text,
        timestamp: new Date(),
      };

      const assistantMessage: Message = {
        id: `msg_${generateId()}`,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      void (async () => {
        try {
          const response = await fetch(`${getApiUrl()}/widget/chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${tokenRef.current}`,
            },
            body: JSON.stringify({
              message: text,
              sessionId: sessionIdRef.current,
            }),
            signal: controller.signal,
          });

          if (response.status === 401) {
            const currentSessionId = sessionIdRef.current;
            localStorage.removeItem(getSessionStorageKey(workspaceId));
            if (currentSessionId) {
              localStorage.removeItem(getHistoryStorageKey(currentSessionId));
            }
            tokenRef.current = null;
            sessionIdRef.current = null;
            await initSession();
            throw new Error("Session expired, please try again");
          }

          if (!response.ok) {
            throw new Error(`Chat request failed: ${response.status}`);
          }

          if (!response.body) {
            throw new Error("No response body");
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";

            for (const raw of events) {
              if (!raw.startsWith("data: ")) continue;
              let event: ChatStreamEvent;
              try {
                event = JSON.parse(raw.slice(6)) as ChatStreamEvent;
              } catch {
                continue;
              }
              if (event.type === "token") {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + event.content,
                    };
                  }
                  return updated;
                });
              } else if (event.type === "error") {
                throw new Error(event.message);
              }
            }
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          const chatError =
            err instanceof Error ? err : new Error("Chat failed");
          setError(chatError);
          onErrorRef.current?.(chatError);
        } finally {
          setIsLoading(false);
          abortRef.current = null;
        }
      })();
    },
    [workspaceId, isLoading, initSession],
  );

  const resetSession = useCallback(() => {
    abortRef.current?.abort();
    const currentSessionId = sessionIdRef.current;
    localStorage.removeItem(getSessionStorageKey(workspaceId));
    if (currentSessionId) {
      localStorage.removeItem(getHistoryStorageKey(currentSessionId));
    }
    tokenRef.current = null;
    sessionIdRef.current = null;
    setMessages([]);
    setError(null);
    setIsLoading(false);
    setIsReady(false);
    void initSession();
  }, [workspaceId, initSession]);

  return { messages, sendMessage, isLoading, error, resetSession, isReady };
}
