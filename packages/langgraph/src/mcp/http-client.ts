export interface McpHttpClientConfig {
  url: string;
  bearerToken?: string;
  timeoutMs?: number;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolCallResult {
  content?: unknown;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export class McpHttpClient {
  private initialized = false;

  constructor(
    private readonly config: McpHttpClientConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.call("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "agent-toolkit-langgraph", version: "0.1.0" },
    });
    this.initialized = true;
  }

  async listTools(): Promise<McpToolDefinition[]> {
    await this.initialize();
    const result = await this.call("tools/list", {});
    const tools =
      isRecord(result) && Array.isArray(result["tools"])
        ? result["tools"].filter(isRecord)
        : [];
    return tools.flatMap((tool) => {
      if (typeof tool["name"] !== "string") return [];
      return [
        {
          name: tool["name"],
          ...(typeof tool["description"] === "string"
            ? { description: tool["description"] }
            : {}),
          ...(isRecord(tool["inputSchema"])
            ? { inputSchema: tool["inputSchema"] }
            : {}),
        },
      ];
    });
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolCallResult> {
    await this.initialize();
    const result = await this.call("tools/call", {
      name,
      arguments: args,
    });
    return isRecord(result) ? result : { content: result };
  }

  private async call(method: string, params: Record<string, unknown>) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 15000,
    );
    try {
      const response = await this.fetchImpl(this.config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(this.config.bearerToken
            ? { Authorization: `Bearer ${this.config.bearerToken}` }
            : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method,
          params,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`MCP ${method} failed: ${response.status}`);
      }

      const payload = await readMcpResponse(response);
      if (isRecord(payload) && isRecord(payload["error"])) {
        throw new Error(
          `MCP ${method} failed: ${String(payload["error"]["message"] ?? "error")}`,
        );
      }
      return isRecord(payload) ? payload["result"] : payload;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readMcpResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (contentType.includes("text/event-stream")) {
    const data = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("");
    return JSON.parse(data);
  }
  return JSON.parse(text);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
