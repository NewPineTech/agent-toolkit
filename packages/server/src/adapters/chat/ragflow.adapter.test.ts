import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RagflowAdapter } from './ragflow.adapter.js';
import type { Logger } from '../../interfaces/logger.interface.js';
import type { ChatProviderConfig } from '../../interfaces/chat-provider.interface.js';

const mockLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

const config: ChatProviderConfig = {
  baseUrl: 'https://ragflow.test',
  apiKey: 'sk-test',
  agentId: 'agent_1',
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

describe('RagflowAdapter', () => {
  let adapter: RagflowAdapter;

  beforeEach(() => {
    adapter = new RagflowAdapter(mockLogger);
    vi.restoreAllMocks();
  });

  describe('createSession', () => {
    it('creates a session and returns the ID', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: 'rf_sess_1' } }), {
          status: 200,
        }),
      );

      const id = await adapter.createSession(config);
      expect(id).toBe('rf_sess_1');

      const call = vi.mocked(fetch).mock.calls[0]!;
      expect(call[0]).toBe(
        'https://ragflow.test/api/v1/agents/agent_1/sessions',
      );
      expect((call[1]!.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer sk-test',
      );
    });

    it('throws on non-OK response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Forbidden', { status: 403 }),
      );
      await expect(adapter.createSession(config)).rejects.toThrow('403');
    });

    it('throws when response has no session ID', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ data: {} }), { status: 200 }),
      );
      await expect(adapter.createSession(config)).rejects.toThrow(
        'no session ID',
      );
    });
  });

  describe('sendMessage', () => {
    it('streams token events from SSE (cumulative answers)', async () => {
      const body = sseStream([
        'data: {"code":0,"data":{"answer":"Hello"}}\n\n',
        'data: {"code":0,"data":{"answer":"Hello world"}}\n\n',
        'data: [DONE]\n\n',
      ]);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(body, { status: 200 }),
      );

      const events = [];
      for await (const event of adapter.sendMessage(config, 'sess_1', 'hi')) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: 'token', content: 'Hello' },
        { type: 'token', content: ' world' },
        { type: 'done', sessionId: 'sess_1', providerSessionId: 'sess_1' },
      ]);
    });

    it('handles delta-style answers (non-cumulative)', async () => {
      const body = sseStream([
        'data: {"code":0,"data":{"answer":"alpha"}}\n\n',
        'data: {"code":0,"data":{"answer":"beta"}}\n\n',
        'data: [DONE]\n\n',
      ]);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(body, { status: 200 }),
      );

      const events = [];
      for await (const event of adapter.sendMessage(config, 'sess_1', 'hi')) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: 'token', content: 'alpha' },
        { type: 'token', content: 'beta' },
        { type: 'done', sessionId: 'sess_1', providerSessionId: 'sess_1' },
      ]);
    });

    it('yields error on non-OK response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('error', { status: 500 }),
      );

      const events = [];
      for await (const event of adapter.sendMessage(config, 's', 'hi')) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('error');
    });

    it('yields error when response has no body', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(null, { status: 200 }),
      );

      const events = [];
      for await (const event of adapter.sendMessage(config, 's', 'hi')) {
        events.push(event);
      }

      expect(events[0]).toMatchObject({
        type: 'error',
        code: 'STREAM_ERROR',
      });
    });

    it('handles provider error codes in SSE data', async () => {
      const body = sseStream([
        'data: {"code":102,"message":"Agent not found"}\n\n',
      ]);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(body, { status: 200 }),
      );

      const events = [];
      for await (const event of adapter.sendMessage(config, 's', 'hi')) {
        events.push(event);
      }

      expect(events[0]).toMatchObject({
        type: 'error',
        code: 'PROVIDER_ERROR',
        message: 'Agent not found',
      });
    });

    it('handles fragmented SSE chunks', async () => {
      const body = sseStream([
        'data: {"code":0,"dat',
        'a":{"answer":"split"}}\n\n',
      ]);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(body, { status: 200 }),
      );

      const events = [];
      for await (const event of adapter.sendMessage(config, 's', 'hi')) {
        events.push(event);
      }

      expect(events).toContainEqual({ type: 'token', content: 'split' });
    });

    it('falls back to raw text for non-JSON data', async () => {
      const body = sseStream(['data: plain text response\n\n']);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(body, { status: 200 }),
      );

      const events = [];
      for await (const event of adapter.sendMessage(config, 's', 'hi')) {
        events.push(event);
      }

      expect(events).toContainEqual({
        type: 'token',
        content: 'plain text response',
      });
    });

    it('sends correct request body', async () => {
      const body = sseStream(['data: [DONE]\n\n']);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(body, { status: 200 }),
      );

      const gen = adapter.sendMessage(config, 'sess_x', 'What is AI?');
      for await (const _ of gen) { /* drain */ }

      const call = vi.mocked(fetch).mock.calls[0]!;
      const reqBody = JSON.parse(call[1]!.body as string);
      expect(reqBody).toEqual({
        question: 'What is AI?',
        session_id: 'sess_x',
        stream: true,
      });
    });
  });
});
