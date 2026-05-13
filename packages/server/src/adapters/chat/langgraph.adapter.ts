import {
  createLangGraphRuntime,
  createAiRecruitmentToolRegistry,
  GeminiChatModelClient,
  GeminiVertexChatModelClient,
  type LangGraphRuntimeEvent,
  McpHttpClient,
  parseLangGraphProviderConfig,
  RagflowRetriever,
  type LangGraphModelClient,
} from "@agent-toolkit/langgraph";
import type { ChatStreamEvent } from "@agent-toolkit/types";
import type {
  ChatProvider,
  ChatProviderConfig,
  ChatProviderMessageContext,
} from "../../interfaces/chat-provider.interface.js";
import type { Logger } from "../../interfaces/logger.interface.js";

export interface LangGraphAdapterOptions {
  geminiApiKey?: string;
  geminiVertex?: {
    apiKey: string;
    project: string;
    location?: string;
  };
  aiRecruitmentMcpUrl?: string;
  aiRecruitmentMcpAuthToken?: string;
  fetchImpl?: typeof fetch;
}

export class LangGraphAdapter implements ChatProvider {
  constructor(
    private readonly logger: Logger,
    private readonly options: LangGraphAdapterOptions = {},
  ) {}

  async createSession(_config?: ChatProviderConfig): Promise<string> {
    return `langgraph_${crypto.randomUUID()}`;
  }

  async *sendMessage(
    config: ChatProviderConfig,
    sessionId: string,
    message: string,
    context?: ChatProviderMessageContext,
  ): AsyncGenerator<ChatStreamEvent, void, undefined> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const model = this.createModelClient(fetchImpl);
    if (!model) {
      yield {
        type: "error",
        code: "PROVIDER_ERROR",
        message: "LangGraph Gemini API key is not configured",
      };
      return;
    }

    try {
      const providerConfig = parseLangGraphProviderConfig(
        config.providerConfig ?? {},
      );
      const retriever = providerConfig.ragflow
        ? new RagflowRetriever(
            {
              ...providerConfig.ragflow,
              apiKey: config.apiKey,
            },
            fetchImpl,
          )
        : undefined;
      const toolRegistry = await this.createToolRegistry(fetchImpl);

      const runtime = createLangGraphRuntime({
        model,
        retriever,
        toolRegistry,
        systemPrompt: providerConfig.systemPrompt,
        onExternalWarning: (warning) => {
          this.logger.warn("LangGraph external dependency unavailable", {
            ...warning,
          });
        },
      });
      const permissions = [
        "docs:read",
        ...(toolRegistry?.listCapabilities() ?? []),
      ];
      const messages = [
        ...(context?.messages ?? []),
        { role: "user" as const, content: message },
      ];

      for await (const event of runtime.stream({
        sessionId,
        requestId: crypto.randomUUID(),
        userContext: {
          userId: "widget",
          role: "widget_user",
          permissions,
        },
        messages,
        memorySummary: context?.memorySummary,
      })) {
        yield mapRuntimeEvent(event);
      }
    } catch (err) {
      this.logger.error("LangGraph workflow failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      yield {
        type: "error",
        code: "PROVIDER_ERROR",
        message: "LangGraph workflow failed",
      };
    }
  }

  private createModelClient(
    fetchImpl: typeof fetch,
  ): LangGraphModelClient | undefined {
    if (this.options.geminiVertex) {
      return new GeminiVertexChatModelClient(
        this.options.geminiVertex,
        fetchImpl,
      );
    }
    if (this.options.geminiApiKey) {
      return new GeminiChatModelClient(
        { apiKey: this.options.geminiApiKey },
        fetchImpl,
      );
    }
    return undefined;
  }

  private async createToolRegistry(fetchImpl: typeof fetch) {
    if (!this.options.aiRecruitmentMcpUrl) return undefined;

    try {
      return await createAiRecruitmentToolRegistry(
        new McpHttpClient(
          {
            url: this.options.aiRecruitmentMcpUrl,
            bearerToken: this.options.aiRecruitmentMcpAuthToken,
          },
          fetchImpl,
        ),
      );
    } catch (err) {
      this.logger.warn(
        "Skipping unavailable optional LangGraph MCP tool registry",
        {
          error: err instanceof Error ? err.message : String(err),
        },
      );
      return undefined;
    }
  }
}

function mapRuntimeEvent(event: LangGraphRuntimeEvent): ChatStreamEvent {
  if (event.type === "confirmation_required") {
    return {
      type: "metadata",
      data: {
        confirmationRequired: {
          capability: event.capability,
          action: event.action,
          summary: event.summary,
          riskLevel: event.riskLevel,
        },
      },
    };
  }

  if (event.type === "error") {
    return {
      type: "error",
      code: event.code,
      message: event.message,
    };
  }

  if (
    event.type === "metadata" ||
    event.type === "token" ||
    event.type === "done"
  ) {
    return event;
  }

  return {
    type: "metadata",
    data: { runtimeEvent: event },
  };
}
