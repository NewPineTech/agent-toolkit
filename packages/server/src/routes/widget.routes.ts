import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { AuthMode } from '@agent-toolkit/types';
import type { Workspace } from '@agent-toolkit/types';
import type { AppCradle } from '../app.js';
import { AppError } from '../factories/error-response.factory.js';
import { schema, type Database } from '../db/index.js';

interface SessionBody {
  workspaceId: string;
  token?: string;
}

const sessionBodySchema = {
  type: 'object',
  required: ['workspaceId'],
  properties: {
    workspaceId: { type: 'string', minLength: 1 },
    token: { type: 'string' },
  },
  additionalProperties: false,
} as const;

export async function widgetRoutes(
  app: FastifyInstance,
  opts: { db: Database },
) {
  app.post<{ Body: SessionBody }>(
    '/widget/session',
    {
      schema: {
        body: sessionBodySchema,
      },
    },
    async (request: FastifyRequest<{ Body: SessionBody }>, reply: FastifyReply) => {
      const cradle = request.diScope.cradle as AppCradle;
      const { workspaceId, token: customerToken } = request.body;

      const workspace = await resolveWorkspace(
        opts.db,
        workspaceId,
        cradle,
      );

      if (!workspace) {
        throw AppError.invalidWorkspace();
      }

      if (
        workspace.authMode === AuthMode.AUTHENTICATED ||
        (workspace.authMode === AuthMode.BOTH && customerToken)
      ) {
        if (!customerToken) {
          throw AppError.invalidAuth();
        }
        await verifyCustomerToken(customerToken, workspace, cradle);
      }

      if (workspace.allowedDomains.length > 0) {
        const origin = request.headers['origin'] ?? null;
        if (!cradle.domainValidator.validate(origin, workspace.allowedDomains)) {
          throw AppError.domainNotAllowed();
        }
      }

      const session = cradle.sessionFactory.create({
        workspaceId,
        ttlMinutes: cradle.config.SESSION_TTL_MINUTES,
      });
      
      await cradle.sessionStore.create(session);
      await cradle.sessionCache.set(session, cradle.config.SESSION_TTL_MINUTES * 60);

      const { token, expiresAt } = await cradle.tokenFactory.createSessionToken({
        workspaceId,
        sessionId: session.id,
        ttlSeconds: cradle.config.SESSION_TTL_MINUTES * 60,
      });

      return reply.status(200).send({
        token,
        sessionId: session.id,
        expiresAt: expiresAt.toISOString(),
      });
    },
  );

  // ─── POST /widget/chat ─── SSE streaming proxy ───

  interface ChatBody {
    message: string;
    sessionId: string;
  }

  const chatBodySchema = {
    type: 'object',
    required: ['message', 'sessionId'],
    properties: {
      message: { type: 'string', minLength: 1 },
      sessionId: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  } as const;

  app.post<{ Body: ChatBody }>(
    '/widget/chat',
    {
      schema: {
        body: chatBodySchema,
      },
    },
    async (request: FastifyRequest<{ Body: ChatBody }>, reply: FastifyReply) => {
      const cradle = request.diScope.cradle as AppCradle;

      const authHeader = request.headers['authorization'];
      if (!authHeader?.startsWith('Bearer ')) {
        throw AppError.invalidToken();
      }
      const tokenPayload = await cradle.tokenService.verify(
        authHeader.slice(7),
      ).catch(() => {
        throw AppError.invalidToken();
      });

      const { workspaceId, sessionId: tokenSessionId } = tokenPayload;
      const { message, sessionId } = request.body;

      if (sessionId !== tokenSessionId) {
        throw AppError.invalidToken();
      }

      const workspace = await resolveWorkspace(opts.db, workspaceId, cradle);
      if (!workspace) {
        throw AppError.invalidWorkspace();
      }

      if (message.length > workspace.maxMessageLength) {
        throw AppError.messageTooLong(workspace.maxMessageLength);
      }

      const rateLimitKey = `chat:${workspaceId}:${request.ip}`;
      const rateLimitResult = await cradle.rateLimiter.check(
        rateLimitKey,
        workspace.rateLimitConfig.maxRequests,
        workspace.rateLimitConfig.windowMs,
      );
      if (!rateLimitResult.allowed) {
        reply.header('Retry-After', String(rateLimitResult.retryAfter ?? 60));
        throw AppError.rateLimited(rateLimitResult.retryAfter);
      }

      let session = await cradle.sessionCache.get(sessionId);
      if (!session) {
        session = await cradle.sessionStore.findById(sessionId);
        if (!session) throw AppError.sessionNotFound();
        await cradle.sessionCache.set(session, cradle.config.SESSION_TTL_MINUTES * 60);
      }
      if (session.expiresAt < new Date()) {
        await cradle.sessionCache.delete(sessionId);
        throw AppError.sessionExpired();
      }

      const { provider, config } = cradle.chatProviderFactory.create(workspace);

      if (!session.providerSessionId) {
        const providerSessionId = await provider.createSession(config);
        await cradle.sessionStore.updateProviderSessionId(sessionId, providerSessionId);
        session = { ...session, providerSessionId };
        await cradle.sessionCache.set(session, cradle.config.SESSION_TTL_MINUTES * 60);
      }

      reply.hijack();

      const sseHeaders: Record<string, string> = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'X-Request-Id': request.id,
      };

      const origin = request.headers.origin;
      if (origin) {
        sseHeaders['Access-Control-Allow-Origin'] = origin;
        sseHeaders['Access-Control-Allow-Credentials'] = 'true';
        sseHeaders['Vary'] = 'Origin';
      }

      reply.raw.writeHead(200, sseHeaders);

      const writeSSE = (data: unknown) => {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        const stream = provider.sendMessage(
          config,
          session.providerSessionId!,
          message,
        );

        for await (const event of stream) {
          if (reply.raw.destroyed) break;
          writeSSE(event);
        }
      } catch (err) {
        cradle.logger.error('Stream error', {
          error: err instanceof Error ? err.message : String(err),
          requestId: request.id,
        });
        if (!reply.raw.destroyed) {
          writeSSE({ type: 'error', code: 'STREAM_ERROR', message: 'Stream interrupted' });
        }
      } finally {
        reply.raw.end();
      }

      Promise.all([
        cradle.sessionStore.updateLastActive(sessionId),
        cradle.usageTracker.increment(
          workspaceId,
          new Date().toISOString().slice(0, 10),
        ),
      ]).catch((err) => {
        cradle.logger.error('Post-stream bookkeeping failed', {
          error: err instanceof Error ? err.message : String(err),
          sessionId,
          workspaceId,
        });
      });
    },
  );

  // ─── Error handler ───

  app.setErrorHandler(async (error, request, reply) => {
    const cradle = request.diScope.cradle as AppCradle;
    const requestId = request.id;

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId,
        },
      });
    }

    const { statusCode, body } = cradle.errorResponseFactory.create(
      error,
      requestId,
    );
    return reply.status(statusCode).send(body);
  });
}

async function resolveWorkspace(
  db: Database,
  workspaceId: string,
  cradle: AppCradle,
): Promise<Workspace | null> {
  const cached = await cradle.workspaceCache.get(workspaceId);
  if (cached) return cached;

  const rows = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId))
    .limit(1);

  const row = rows[0];
  
  if (!row) return null;

  const workspace = cradle.workspaceFactory.fromRow(row);
  await cradle.workspaceCache.set(workspace);
  return workspace;
}

async function verifyCustomerToken(
  customerToken: string,
  workspace: Workspace,
  cradle: AppCradle,
): Promise<void> {
  if (!workspace.authSecret) {
    throw AppError.invalidAuth();
  }

  try {
    const secret = cradle.encryptionService.decrypt(workspace.authSecret);
    const { createHmac, timingSafeEqual } = await import('node:crypto');

    const [headerB64, payloadB64, signatureB64] = customerToken.split('.');
    if (!headerB64 || !payloadB64 || !signatureB64) {
      throw new Error('Malformed JWT');
    }

    const expectedSig = createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    const actualBuf = Buffer.from(signatureB64, 'utf8');
    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      throw new Error('Invalid signature');
    }

    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    if (typeof payload['exp'] === 'number' && payload['exp'] < Date.now() / 1000) {
      throw new Error('Token expired');
    }
  } catch (err) {
    cradle.logger.warn('Customer token verification failed', {
      workspaceId: workspace.id,
      error: err instanceof Error ? err.message : String(err),
    });
    throw AppError.invalidAuth();
  }
}
