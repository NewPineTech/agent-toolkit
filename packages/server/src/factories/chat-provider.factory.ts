import { ProviderType } from "@agent-toolkit/types";
import type { Workspace } from "@agent-toolkit/types";
import type {
  ChatProvider,
  ChatProviderConfig,
} from "../interfaces/chat-provider.interface.js";
import type { EncryptionService } from "../interfaces/encryption-service.interface.js";
import type { Logger } from "../interfaces/logger.interface.js";
import { LangGraphAdapter } from "../adapters/chat/langgraph.adapter.js";
import { RagflowAdapter } from "../adapters/chat/ragflow.adapter.js";

export interface ChatProviderFactoryOptions {
  geminiApiKey?: string;
  geminiVertex?: {
    apiKey: string;
    project: string;
    location?: string;
  };
  aiRecruitmentMcpUrl?: string;
  aiRecruitmentMcpAuthToken?: string;
}

export class ChatProviderFactory {
  private readonly adapters = new Map<string, ChatProvider>();

  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly logger: Logger,
    private readonly options: ChatProviderFactoryOptions = {},
  ) {}

  create(workspace: Workspace): {
    provider: ChatProvider;
    config: ChatProviderConfig;
  } {
    const provider = this.getOrCreateAdapter(workspace.providerType);
    const config: ChatProviderConfig = {
      baseUrl: workspace.providerBaseUrl,
      apiKey: this.resolveProviderApiKey(workspace),
      agentId: workspace.providerAgentId,
      providerConfig: workspace.providerConfig,
    };
    return { provider, config };
  }

  private resolveProviderApiKey(workspace: Workspace): string {
    if (workspace.providerType === ProviderType.LANGGRAPH) {
      return isRecord(workspace.providerConfig["ragflow"])
        ? this.encryptionService.decrypt(workspace.providerApiKey)
        : "";
    }

    return this.encryptionService.decrypt(workspace.providerApiKey);
  }

  private getOrCreateAdapter(providerType: string): ChatProvider {
    const existing = this.adapters.get(providerType);
    if (existing) return existing;

    let adapter: ChatProvider;
    switch (providerType) {
      case ProviderType.RAGFLOW:
        adapter = new RagflowAdapter(this.logger);
        break;
      case ProviderType.LANGGRAPH:
        adapter = new LangGraphAdapter(this.logger, {
          geminiApiKey: this.options.geminiApiKey,
          geminiVertex: this.options.geminiVertex,
          aiRecruitmentMcpUrl: this.options.aiRecruitmentMcpUrl,
          aiRecruitmentMcpAuthToken: this.options.aiRecruitmentMcpAuthToken,
        });
        break;
      default:
        throw new Error(`Unsupported provider type: ${providerType}`);
    }

    this.adapters.set(providerType, adapter);
    return adapter;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
