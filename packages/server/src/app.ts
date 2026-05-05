import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyAwilixPlugin, diContainer } from "@fastify/awilix";
import { asClass, asFunction, asValue, Lifetime } from "awilix";
import { Redis } from "ioredis";
import type { Config } from "./config/env.js";
import { createDatabase } from "./db/connection.js";

import { CompositeHealthChecker } from "./adapters/infra/composite-health.checker.js";
import { healthRoutes } from "./routes/health.routes.js";
import { widgetRoutes } from "./routes/widget.routes.js";
import { embedRoute } from "./routes/embed.route.js";
import { AesEncryptionService } from "./adapters/security/aes-encryption.service.js";
import { JwtTokenService } from "./adapters/security/jwt-token.service.js";
import { AllowlistDomainValidator } from "./adapters/security/allowlist-domain.validator.js";
import { PostgresSessionStore } from "./adapters/storage/postgres-session.store.js";
import { PostgresUsageTracker } from "./adapters/storage/postgres-usage.tracker.js";
import { RedisSessionCache } from "./adapters/storage/redis-session.cache.js";
import { RedisWorkspaceCache } from "./adapters/storage/redis-workspace.cache.js";
import { RedisRateLimiter } from "./adapters/infra/redis-rate.limiter.js";
import { PinoLoggerAdapter } from "./adapters/infra/pino-logger.adapter.js";
import {
  ChatProviderFactory,
  SessionFactory,
  TokenFactory,
  WorkspaceFactory,
  ErrorResponseFactory,
} from "./factories/index.js";

export interface AppCradle {
  config: Config;
  encryptionService: AesEncryptionService;
  tokenService: JwtTokenService;
  domainValidator: AllowlistDomainValidator;
  sessionStore: PostgresSessionStore;
  sessionCache: RedisSessionCache;
  usageTracker: PostgresUsageTracker;
  rateLimiter: RedisRateLimiter;
  workspaceCache: RedisWorkspaceCache;
  logger: PinoLoggerAdapter;
  chatProviderFactory: ChatProviderFactory;
  sessionFactory: SessionFactory;
  tokenFactory: TokenFactory;
  workspaceFactory: WorkspaceFactory;
  errorResponseFactory: ErrorResponseFactory;
}

declare module "@fastify/awilix" {
  interface Cradle extends AppCradle {}
}

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
  }
}

export async function createApp(config: Config) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
    },
    genReqId: () => crypto.randomUUID(),
    requestIdHeader: "x-request-id",
  });

  const { db, pool } = createDatabase(config.DATABASE_URL);
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
  await redis.connect();

  await app.register(fastifyAwilixPlugin, {
    disposeOnClose: true,
    disposeOnResponse: false,
  });

  diContainer.register({
    config: asValue(config),

    encryptionService: asFunction(
      () => new AesEncryptionService(config.ENCRYPTION_KEY),
    ).setLifetime(Lifetime.SINGLETON),

    tokenService: asFunction(
      () => new JwtTokenService(config.JWT_SECRET),
    ).setLifetime(Lifetime.SINGLETON),

    domainValidator: asFunction(
      () => new AllowlistDomainValidator(config.NODE_ENV === "development"),
    ).setLifetime(Lifetime.SINGLETON),

    sessionStore: asFunction(() => new PostgresSessionStore(db)).setLifetime(
      Lifetime.SINGLETON,
    ),

    sessionCache: asFunction(() => new RedisSessionCache(redis)).setLifetime(
      Lifetime.SINGLETON,
    ),

    usageTracker: asFunction(() => new PostgresUsageTracker(db)).setLifetime(
      Lifetime.SINGLETON,
    ),

    rateLimiter: asFunction(() => new RedisRateLimiter(redis)).setLifetime(
      Lifetime.SINGLETON,
    ),

    workspaceCache: asFunction(
      () => new RedisWorkspaceCache(redis),
    ).setLifetime(Lifetime.SINGLETON),

    logger: asFunction(() => new PinoLoggerAdapter(app.log)).setLifetime(
      Lifetime.SINGLETON,
    ),

    chatProviderFactory: asFunction(
      (cradle: AppCradle) =>
        new ChatProviderFactory(cradle.encryptionService, cradle.logger),
    ).setLifetime(Lifetime.SINGLETON),

    sessionFactory: asClass(SessionFactory).setLifetime(Lifetime.SINGLETON),

    tokenFactory: asFunction(
      (cradle: AppCradle) => new TokenFactory(cradle.tokenService),
    ).setLifetime(Lifetime.SINGLETON),

    workspaceFactory: asClass(WorkspaceFactory).setLifetime(Lifetime.SINGLETON),

    errorResponseFactory: asFunction(
      (cradle: AppCradle) => new ErrorResponseFactory(cradle.logger),
    ).setLifetime(Lifetime.SINGLETON),
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || config.NODE_ENV === "development") {
        cb(null, true);
        return;
      }
      cb(null, origin);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
    maxAge: config.CORS_MAX_AGE,
  });

  await app.register(healthRoutes, {
    healthChecker: new CompositeHealthChecker(pool, redis),
  });
  await app.register(widgetRoutes, { db });
  await app.register(embedRoute);

  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Request-Id", request.id);
  });

  app.addHook("onClose", async () => {
    await redis.quit();
    await pool.end();
  });

  return app;
}
