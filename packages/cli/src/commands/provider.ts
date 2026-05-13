import {
  AesEncryptionService,
  testRagflowSessionEndpoint,
} from "@agent-toolkit/core";
import {
  DEFAULT_GEMINI_MODEL,
  parseLangGraphProviderConfig,
} from "@agent-toolkit/langgraph";
import type { CliContext } from "../context.js";
import { writeLine } from "../context.js";
import { createPool, findWorkspace } from "../db.js";
import { withPool } from "./shared.js";

export async function runProviderTest(
  context: CliContext,
  workspaceId: string,
) {
  await withPool(createPool, async (pool) => {
    const workspace = await findWorkspace(pool, workspaceId);
    if (!workspace) throw new Error(`Workspace "${workspaceId}" not found`);
    if (workspace.provider_type === "langgraph") {
      const providerConfig = parseLangGraphProviderConfig(
        workspace.provider_config ?? {},
      );
      writeLine(
        context,
        `langgraph: model gemini/${DEFAULT_GEMINI_MODEL} configured`,
      );
      if (providerConfig.ragflow) {
        writeLine(context, "langgraph: ragflow retrieval configured");
      }
      return;
    }

    if (workspace.provider_type !== "ragflow") {
      throw new Error(`Unsupported provider type: ${workspace.provider_type}`);
    }

    const encryptionKey = process.env["ENCRYPTION_KEY"];
    if (!encryptionKey) {
      throw new Error("ENCRYPTION_KEY is required for provider tests");
    }

    const result = await testRagflowSessionEndpoint({
      baseUrl: workspace.provider_base_url,
      agentId: workspace.provider_agent_id,
      apiKey: new AesEncryptionService(encryptionKey).decrypt(
        workspace.provider_api_key,
      ),
    });

    if (result.error) {
      writeLine(context, `${result.url}: unreachable (${result.error})`);
      process.exitCode = 1;
      return;
    }
    writeLine(context, `${result.url}: HTTP ${result.status}`);
    if (!result.ok) process.exitCode = 1;
  });
}
