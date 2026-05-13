import { DEFAULT_GEMINI_MODEL } from "../config.js";
import {
  LangGraphWorkflowError,
  type LangGraphModelClient,
  type TextGenerationInput,
} from "../runtime.js";
import type { RouteClassificationInput } from "../runtime.js";
import type { ExecutionPlan, RouteDecision, RuntimeRoute } from "../state.js";
import {
  buildAnswerPrompt,
  buildPlannerPrompt,
  buildRouteClassificationPrompt,
} from "../prompts/index.js";

export interface GeminiChatModelConfig {
  apiKey: string;
  model?: typeof DEFAULT_GEMINI_MODEL;
}

export interface GeminiVertexChatModelConfig {
  apiKey: string;
  project: string;
  location?: string;
  model?: typeof DEFAULT_GEMINI_MODEL;
}

export class GeminiChatModelClient implements LangGraphModelClient {
  constructor(
    private readonly config: GeminiChatModelConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async classifyRoute(input: RouteClassificationInput): Promise<RouteDecision> {
    return parseRouteDecision(
      await this.generateJson(buildRouteClassificationPrompt(input)),
    );
  }

  async createPlan(input: RouteClassificationInput): Promise<ExecutionPlan> {
    return parseExecutionPlan(
      await this.generateJson(buildPlannerPrompt(input)),
    );
  }

  async *streamText(request: TextGenerationInput): AsyncGenerator<string> {
    const model = this.config.model ?? DEFAULT_GEMINI_MODEL;
    const response = await this.fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model,
      )}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.config.apiKey,
        },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: buildAnswerPrompt(request) }] },
          ],
        }),
      },
    );

    if (!response.ok) {
      throw await createGeminiProviderError(response, "generation");
    }
    if (!response.body) {
      throw new Error("Gemini generation returned no response body");
    }

    yield* parseGeminiSse(response.body);
  }

  private async generateJson(prompt: string): Promise<unknown> {
    const model = this.config.model ?? DEFAULT_GEMINI_MODEL;
    const response = await this.fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model,
      )}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.config.apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0,
          },
        }),
      },
    );

    if (!response.ok) {
      throw await createGeminiProviderError(response, "JSON generation");
    }

    return response.json();
  }
}

export class GeminiVertexChatModelClient implements LangGraphModelClient {
  constructor(
    private readonly config: GeminiVertexChatModelConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async classifyRoute(input: RouteClassificationInput): Promise<RouteDecision> {
    return parseRouteDecision(
      await this.generateJson(buildRouteClassificationPrompt(input)),
    );
  }

  async createPlan(input: RouteClassificationInput): Promise<ExecutionPlan> {
    return parseExecutionPlan(
      await this.generateJson(buildPlannerPrompt(input)),
    );
  }

  async *streamText(request: TextGenerationInput): AsyncGenerator<string> {
    const response = await this.fetchImpl(
      this.buildUrl("streamGenerateContent", true),
      {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: buildAnswerPrompt(request) }] },
          ],
        }),
      },
    );

    if (!response.ok) {
      throw await createGeminiProviderError(response, "generation");
    }
    if (!response.body) {
      throw new Error("Gemini generation returned no response body");
    }

    yield* parseGeminiSse(response.body);
  }

  private async generateJson(prompt: string): Promise<unknown> {
    const response = await this.fetchImpl(this.buildUrl("generateContent"), {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0,
        },
      }),
    });

    if (!response.ok) {
      throw await createGeminiProviderError(response, "JSON generation");
    }

    return response.json();
  }

  private buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-goog-api-key": this.config.apiKey,
    };
  }

  private buildUrl(
    operation: "generateContent" | "streamGenerateContent",
    stream = false,
  ): string {
    const location = this.config.location ?? "global";
    const host =
      location === "global"
        ? "aiplatform.googleapis.com"
        : `${location}-aiplatform.googleapis.com`;
    const model = this.config.model ?? DEFAULT_GEMINI_MODEL;
    const path = [
      "v1",
      "projects",
      encodeURIComponent(this.config.project),
      "locations",
      encodeURIComponent(location),
      "publishers",
      "google",
      "models",
      `${encodeURIComponent(model)}:${operation}`,
    ].join("/");

    return `https://${host}/${path}${stream ? "?alt=sse" : ""}`;
  }
}

async function createGeminiProviderError(
  response: Response,
  operation: "generation" | "JSON generation",
): Promise<Error> {
  const fallback = `Gemini ${operation} failed: ${response.status}`;
  const text = await response.text().catch(() => "");
  if (!text.trim()) return new Error(fallback);

  try {
    const payload = JSON.parse(text) as unknown;
    if (isRecord(payload) && isRecord(payload["error"])) {
      const error = payload["error"];
      const status =
        typeof error["status"] === "string" ? ` ${error["status"]}` : "";
      const message =
        typeof error["message"] === "string" && error["message"].trim()
          ? sanitizeProviderMessage(error["message"])
          : fallback;
      return new LangGraphWorkflowError(
        "GEMINI_PROVIDER_ERROR",
        `Gemini provider failed (${response.status}${status}): ${message}`,
        response.status === 429 || response.status >= 500,
      );
    }
  } catch {
    // Fall back to the stable historic error when Gemini returns non-JSON.
  }

  return new Error(fallback);
}

function sanitizeProviderMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 300);
}

const SUPPORTED_ROUTES = new Set<RuntimeRoute>([
  "free_chat",
  "knowledge_qa",
  "complex_analysis",
  "tool_task",
  "tool_action",
  "ticket_creation",
  "report_generation",
  "admin_action",
  "clarification",
  "unsupported",
]);

function parseRouteDecision(payload: unknown): RouteDecision {
  const text = extractGeminiText(payload);
  const raw = parseJsonObject(text);
  const route = typeof raw.route === "string" ? raw.route : "unsupported";
  const confidence =
    typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
      ? Math.max(0, Math.min(raw.confidence, 1))
      : 0;
  const reason =
    typeof raw.reason === "string" && raw.reason.trim().length > 0
      ? raw.reason
      : "Gemini route classification returned no reason";
  const capability =
    typeof raw.capability === "string" && raw.capability.trim().length > 0
      ? raw.capability
      : undefined;

  return {
    route: SUPPORTED_ROUTES.has(route as RuntimeRoute)
      ? (route as RuntimeRoute)
      : "unsupported",
    capability,
    confidence,
    reason,
  };
}

function parseExecutionPlan(payload: unknown): ExecutionPlan {
  const text = extractGeminiText(payload);
  const raw = parseJsonObject(text);
  const steps = Array.isArray(raw["steps"])
    ? raw["steps"].filter(isRecord).map((step, index) => ({
        id: typeof step["id"] === "string" ? step["id"] : `step_${index + 1}`,
        type: parseStepType(step["type"]),
        instruction:
          typeof step["instruction"] === "string"
            ? step["instruction"]
            : "Analyze the request",
        ...(typeof step["capability"] === "string"
          ? { capability: step["capability"] }
          : {}),
      }))
    : [];

  return {
    goal: typeof raw["goal"] === "string" ? raw["goal"] : "Answer the user",
    steps,
    responseFormat: parseResponseFormat(raw["responseFormat"]),
  };
}

function parseStepType(value: unknown): ExecutionPlan["steps"][number]["type"] {
  if (
    value === "memory" ||
    value === "retrieval" ||
    value === "mcp_tool" ||
    value === "analysis"
  ) {
    return value;
  }
  return "analysis";
}

function parseResponseFormat(value: unknown): ExecutionPlan["responseFormat"] {
  if (!Array.isArray(value)) return ["markdown"];
  const allowed = new Set([
    "markdown",
    "references",
    "table",
    "chart",
    "image",
  ]);
  const parsed = value.filter(
    (entry): entry is ExecutionPlan["responseFormat"][number] =>
      typeof entry === "string" && allowed.has(entry),
  );
  return parsed.length > 0 ? parsed : ["markdown"];
}

function extractGeminiText(payload: unknown): string {
  const response = payload as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  const text = response.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini route classification returned no text");
  }

  return text;
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    }
  }

  throw new Error("Gemini route classification returned invalid JSON");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function* parseGeminiSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";

      for (const event of events) {
        const token = parseGeminiSseEvent(event);
        if (token) yield token;
      }
    }

    if (buffer.trim()) {
      const token = parseGeminiSseEvent(buffer);
      if (token) yield token;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseGeminiSseEvent(raw: string): string | null {
  const data = raw
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("");

  if (!data || data === "[DONE]") return null;

  const parsed = JSON.parse(data) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  const text = parsed.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("");

  return text && text.length > 0 ? text : null;
}
