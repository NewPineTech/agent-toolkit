import { request } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createAgenticServer } from "../../server.js";

describe("agentic HTTP server", () => {
  const servers: ReturnType<typeof createAgenticServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
    servers.length = 0;
  });

  it("responds to health checks", async () => {
    const { port } = await listen();
    const response = await post(port, "GET", "/health");

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"status":"ok"');
  });

  it("streams chat events", async () => {
    const { port } = await listen();
    const response = await post(port, "POST", "/chat", {
      threadId: "http-chat-test",
      message: "leave policy",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain('"type":"token"');
    expect(response.body).toContain('"type":"done"');
  });

  it("returns an SSE error for oversized chat bodies", async () => {
    const { port } = await listen();
    const response = await post(port, "POST", "/chat", {
      threadId: "http-large-body-test",
      message: "x".repeat(70 * 1024),
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Chat request body is too large");
  });

  async function listen(): Promise<{ port: number }> {
    const server = createAgenticServer();
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Server did not expose a port");
    }
    return { port: address.port };
  }
});

async function post(
  port: number,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<{
  statusCode: number | undefined;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = request(
      {
        port,
        path,
        method,
        headers: payload
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            }
          : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}
