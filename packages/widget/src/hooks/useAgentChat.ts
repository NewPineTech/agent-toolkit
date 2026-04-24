import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatStreamEvent, SessionResponse } from '@agent-toolkit/types';
import { getApiUrl } from '../config.js';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
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

const SESSION_STORAGE_KEY = 'agent_chat_session';

export function useAgentChat(
  options: UseAgentChatOptions,
): UseAgentChatReturn {
  const { workspaceId, onError } = options;
  const apiUrl = getApiUrl();

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
      const stored = localStorage.getItem(
        `${SESSION_STORAGE_KEY}:${workspaceId}`,
      );
      if (stored) {
        const parsed = JSON.parse(stored) as {
          token: string;
          sessionId: string;
          expiresAt: string;
        };
        if (new Date(parsed.expiresAt) > new Date()) {
          tokenRef.current = parsed.token;
          sessionIdRef.current = parsed.sessionId;
          setIsReady(true);
          return;
        }
        localStorage.removeItem(`${SESSION_STORAGE_KEY}:${workspaceId}`);
      }

      const response = await fetch(`${apiUrl}/widget/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });

      if (!response.ok) {
        throw new Error(`Session creation failed: ${response.status}`);
      }

      const data = (await response.json()) as SessionResponse;
      tokenRef.current = data.token;
      sessionIdRef.current = data.sessionId;

      localStorage.setItem(
        `${SESSION_STORAGE_KEY}:${workspaceId}`,
        JSON.stringify(data),
      );

      setIsReady(true);
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Session init failed');
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

  const sendMessage = useCallback(
    (text: string) => {
      if (!tokenRef.current || !sessionIdRef.current || isLoading) return;

      const userMessage: Message = {
        id: `msg_${Date.now()}_user`,
        role: 'user',
        content: text,
        timestamp: new Date(),
      };

      const assistantMessage: Message = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      void (async () => {
        try {
          const response = await fetch(`${apiUrl}/widget/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tokenRef.current}`,
            },
            body: JSON.stringify({
              message: text,
              sessionId: sessionIdRef.current,
            }),
            signal: controller.signal,
          });

          if (response.status === 401) {
            localStorage.removeItem(
              `${SESSION_STORAGE_KEY}:${workspaceId}`,
            );
            tokenRef.current = null;
            sessionIdRef.current = null;
            await initSession();
            throw new Error('Session expired, please try again');
          }

          if (!response.ok) {
            throw new Error(`Chat request failed: ${response.status}`);
          }

          if (!response.body) {
            throw new Error('No response body');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';

            for (const raw of events) {
              if (!raw.startsWith('data: ')) continue;
              let event: ChatStreamEvent;
              try {
                event = JSON.parse(raw.slice(6)) as ChatStreamEvent;
              } catch {
                continue;
              }
              if (event.type === 'token') {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === 'assistant') {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + event.content,
                    };
                  }
                  return updated;
                });
              } else if (event.type === 'error') {
                throw new Error(event.message);
              }
            }
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          const chatError =
            err instanceof Error ? err : new Error('Chat failed');
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
    localStorage.removeItem(`${SESSION_STORAGE_KEY}:${workspaceId}`);
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
