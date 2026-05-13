import type { CapabilityTool } from "../tools/tool-registry.js";
import { CapabilityToolRegistry } from "../tools/tool-registry.js";
import type { McpHttpClient } from "./http-client.js";

export interface AiRecruitmentToolRegistryOptions {
  capabilityPrefix?: string;
}

export async function createAiRecruitmentToolRegistry(
  client: McpHttpClient,
  options: AiRecruitmentToolRegistryOptions = {},
): Promise<CapabilityToolRegistry> {
  const prefix = options.capabilityPrefix ?? "ai-recruitment";
  const tools = await client.listTools();

  return new CapabilityToolRegistry(
    tools.map((tool): CapabilityTool => {
      const capability = `${prefix}.${tool.name}`;
      return {
        name: tool.name,
        capability,
        description: tool.description ?? tool.name,
        riskLevel: "low",
        requiredPermissions: [],
        requiresConfirmation: false,
        timeoutMs: 15000,
        retryPolicy: { maxAttempts: 1 },
        auditRequired: true,
        prepareArgs(request) {
          return {
            query: request.messages
              .filter((message) => message.role === "user")
              .map((message) => message.content)
              .join("\n"),
          };
        },
        async execute(_request, args) {
          const result = await client.callTool(tool.name, args);
          return {
            status: result.isError ? "failed" : "success",
            data: {
              tool: tool.name,
              content: result.content,
              structuredContent: result.structuredContent,
            },
            ...(result.isError ? { error: "MCP tool returned an error" } : {}),
          };
        },
      };
    }),
  );
}
