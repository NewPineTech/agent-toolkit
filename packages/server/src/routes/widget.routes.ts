import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  AuthMode,
  ProviderType,
  type ChatStreamEvent,
} from "@agent-toolkit/types";
import type { Workspace } from "@agent-toolkit/types";
import type { AppCradle } from "../app.js";
import { AppError } from "../factories/error-response.factory.js";
import { schema, type Database } from "../db/index.js";
import {
  AgenticRunAuditRecorder,
  type AgenticRunAuditContext,
} from "../admin/agentic-run-audit.recorder.js";

interface SessionBody {
  workspaceId: string;
  token?: string;
}

const sessionBodySchema = {
  type: "object",
  required: ["workspaceId"],
  properties: {
    workspaceId: { type: "string", minLength: 1 },
    token: { type: "string" },
  },
  additionalProperties: false,
} as const;

export async function widgetRoutes(
  app: FastifyInstance,
  opts: { db: Database },
) {
  app.post<{ Body: SessionBody }>(
    "/widget/session",
    {
      schema: {
        body: sessionBodySchema,
      },
    },
    async (
      request: FastifyRequest<{ Body: SessionBody }>,
      reply: FastifyReply,
    ) => {
      const cradle = request.diScope.cradle as AppCradle;
      const { workspaceId, token: customerToken } = request.body;

      const workspace = await resolveWorkspace(opts.db, workspaceId, cradle);

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
        const origin = request.headers["origin"] ?? null;
        if (
          !cradle.domainValidator.validate(origin, workspace.allowedDomains)
        ) {
          throw AppError.domainNotAllowed();
        }
      }

      const session = cradle.sessionFactory.create({
        workspaceId,
        ttlMinutes: cradle.config.SESSION_TTL_MINUTES,
      });

      await cradle.sessionStore.create(session);
      await cradle.sessionCache.set(
        session,
        cradle.config.SESSION_TTL_MINUTES * 60,
      );

      const { token, expiresAt } = await cradle.tokenFactory.createSessionToken(
        {
          workspaceId,
          sessionId: session.id,
          ttlSeconds: cradle.config.SESSION_TTL_MINUTES * 60,
        },
      );

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
    type: "object",
    required: ["message", "sessionId"],
    properties: {
      message: { type: "string", minLength: 1 },
      sessionId: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  } as const;

  app.post<{ Body: ChatBody }>(
    "/widget/chat",
    {
      schema: {
        body: chatBodySchema,
      },
    },
    async (
      request: FastifyRequest<{ Body: ChatBody }>,
      reply: FastifyReply,
    ) => {
      const cradle = request.diScope.cradle as AppCradle;

      const authHeader = request.headers["authorization"];
      if (!authHeader?.startsWith("Bearer ")) {
        throw AppError.invalidToken();
      }
      const tokenPayload = await cradle.tokenService
        .verify(authHeader.slice(7))
        .catch(() => {
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
        reply.header("Retry-After", String(rateLimitResult.retryAfter ?? 60));
        throw AppError.rateLimited(rateLimitResult.retryAfter);
      }

      let session = await cradle.sessionCache.get(sessionId);
      if (!session) {
        session = await cradle.sessionStore.findById(sessionId);
        if (!session) throw AppError.sessionNotFound();
        await cradle.sessionCache.set(
          session,
          cradle.config.SESSION_TTL_MINUTES * 60,
        );
      }
      if (session.expiresAt < new Date()) {
        await cradle.sessionCache.delete(sessionId);
        throw AppError.sessionExpired();
      }

      const { provider, config } = cradle.chatProviderFactory.create(workspace);

      if (!session.providerSessionId) {
        const providerSessionId = await provider.createSession(config);
        await cradle.sessionStore.updateProviderSessionId(
          sessionId,
          providerSessionId,
        );
        session = { ...session, providerSessionId };
        await cradle.sessionCache.set(
          session,
          cradle.config.SESSION_TTL_MINUTES * 60,
        );
      }

      reply.hijack();

      const sseHeaders: Record<string, string> = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Request-Id": request.id,
      };

      const origin = request.headers.origin;
      if (origin) {
        sseHeaders["Access-Control-Allow-Origin"] = origin;
        sseHeaders["Access-Control-Allow-Credentials"] = "true";
        sseHeaders["Vary"] = "Origin";
      }

      reply.raw.writeHead(200, sseHeaders);

      const writeSSE = (data: unknown) => {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const audit = await startAgenticWidgetAudit({
        cradle,
        workspace,
        requestId: request.id,
        threadId: session.providerSessionId!,
        widgetSessionId: sessionId,
        message,
      });
      let finalAnswer = "";
      const warningCodes: string[] = [];
      let failed = false;

      try {
        const stream = provider.sendMessage(
          config,
          session.providerSessionId!,
          message,
        );

        for await (const event of stream) {
          if (reply.raw.destroyed) break;
          collectAgenticAuditSignal(event, warningCodes, (content) => {
            finalAnswer += content;
          });
          if (event.type === "error") failed = true;
          writeSSE(event);
        }
      } catch (err) {
        failed = true;
        cradle.logger.error("Stream error", {
          error: err instanceof Error ? err.message : String(err),
          requestId: request.id,
        });
        if (!reply.raw.destroyed) {
          writeSSE({
            type: "error",
            code: "STREAM_ERROR",
            message: "Stream interrupted",
          });
        }
      } finally {
        await Promise.allSettled([
          finishAgenticWidgetAudit({
            audit,
            failed,
            finalAnswer,
            message,
            warningCodes,
            workspaceId,
            threadId: session.providerSessionId!,
          }),
          cradle.sessionStore.updateLastActive(sessionId),
          cradle.usageTracker.increment(
            workspaceId,
            new Date().toISOString().slice(0, 10),
          ),
        ]).then((results) => {
          for (const result of results) {
            if (result.status === "rejected") {
              cradle.logger.error("Post-stream bookkeeping failed", {
                error:
                  result.reason instanceof Error
                    ? result.reason.message
                    : String(result.reason),
                sessionId,
                workspaceId,
              });
            }
          }
        });

        reply.raw.end();
      }
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

interface AgenticWidgetAuditStartInput {
  cradle: AppCradle;
  workspace: Workspace;
  requestId: string;
  threadId: string;
  widgetSessionId: string;
  message: string;
}

interface AgenticWidgetAuditHandle {
  recorder: AgenticRunAuditRecorder;
  run: AgenticRunAuditContext;
}

async function startAgenticWidgetAudit({
  cradle,
  workspace,
  requestId,
  threadId,
  widgetSessionId,
  message,
}: AgenticWidgetAuditStartInput): Promise<AgenticWidgetAuditHandle | null> {
  if (workspace.providerType !== ProviderType.LANGGRAPH) return null;

  try {
    const recorder = new AgenticRunAuditRecorder(cradle.agenticRunAuditStore);
    const run = await recorder.startRun({
      runId: `widget_${requestId}`,
      threadId,
      workspaceId: workspace.id,
      stateDelta: {
        input: message,
        widgetSessionId,
        providerType: workspace.providerType,
      },
    });
    await recorder.recordStep(run, {
      nodeName: "widget.chat",
      logicalStep: "input",
      status: "completed",
      evidenceRefs: [],
      stateDelta: { input: message, widgetSessionId },
    });
    return { recorder, run };
  } catch (error) {
    cradle.logger.warn("Agentic audit start failed", {
      error: error instanceof Error ? error.message : String(error),
      requestId,
      workspaceId: workspace.id,
    });
    return null;
  }
}

function collectAgenticAuditSignal(
  event: ChatStreamEvent,
  warningCodes: string[],
  appendToken: (content: string) => void,
): void {
  if (event.type === "token") {
    appendToken(event.content);
    return;
  }

  if (event.type !== "metadata") return;
  const warning = event.data["warning"];
  if (typeof warning === "string") {
    warningCodes.push(warning);
  }
}

async function finishAgenticWidgetAudit(input: {
  audit: AgenticWidgetAuditHandle | null;
  failed: boolean;
  finalAnswer: string;
  message: string;
  warningCodes: string[];
  workspaceId: string;
  threadId: string;
}): Promise<void> {
  if (!input.audit) return;
  const uniqueWarnings = [...new Set(input.warningCodes)];
  await input.audit.recorder.recordStep(input.audit.run, {
    nodeName: "langgraph.agentic",
    logicalStep: "final_answer",
    status: input.failed ? "failed" : "completed",
    warningCodes: uniqueWarnings,
    stateDelta: {
      input: input.message,
      finalAnswer: input.finalAnswer,
      workspaceId: input.workspaceId,
      threadId: input.threadId,
    },
  });

  const finishInput = {
    warningCodes: uniqueWarnings,
    selectedIntents: [],
    stateDelta: {
      input: input.message,
      finalAnswer: input.finalAnswer,
      workspaceId: input.workspaceId,
      threadId: input.threadId,
    },
  };

  if (input.failed) {
    await input.audit.recorder.failRun(input.audit.run, finishInput);
    return;
  }

  await input.audit.recorder.completeRun(input.audit.run, finishInput);
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

    const [headerB64, payloadB64, signatureB64] = customerToken.split(".");
    if (!headerB64 || !payloadB64 || !signatureB64) {
      throw new Error("Malformed JWT");
    }

    const expectedSig = createHmac("sha256", secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");

    const expectedBuf = Buffer.from(expectedSig, "utf8");
    const actualBuf = Buffer.from(signatureB64, "utf8");
    if (
      expectedBuf.length !== actualBuf.length ||
      !timingSafeEqual(expectedBuf, actualBuf)
    ) {
      throw new Error("Invalid signature");
    }

    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    if (
      typeof payload["exp"] === "number" &&
      payload["exp"] < Date.now() / 1000
    ) {
      throw new Error("Token expired");
    }
  } catch (err) {
    cradle.logger.warn("Customer token verification failed", {
      workspaceId: workspace.id,
      error: err instanceof Error ? err.message : String(err),
    });
    throw AppError.invalidAuth();
  }
}
