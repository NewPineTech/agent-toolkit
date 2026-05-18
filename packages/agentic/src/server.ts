import { createServer } from "node:http";
import { handleChatRequest } from "./http/chat.js";

export function createAgenticServer() {
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (request.method === "POST" && request.url === "/chat") {
      await handleChatRequest(request, response);
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const port = Number(process.env["PORT"] ?? 2024);
  createAgenticServer().listen(port, () => {
    console.log(`Agentic server listening on ${port}`);
  });
}
