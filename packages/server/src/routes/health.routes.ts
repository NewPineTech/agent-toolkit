import type { FastifyInstance } from "fastify";
import type { HealthChecker } from "../interfaces/health-checker.interface.js";

export async function healthRoutes(
  app: FastifyInstance,
  opts: { healthChecker: HealthChecker },
) {
  app.get("/health/live", async (_request, reply) => {
    return reply.status(200).send({ status: "ok" });
  });

  app.get("/health/ready", async (_request, reply) => {
    const result = await opts.healthChecker.check();
    const statusCode = result.status === "healthy" ? 200 : 503;
    return reply.status(statusCode).send(result);
  });
}
