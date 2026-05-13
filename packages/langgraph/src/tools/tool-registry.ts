import { LangGraphWorkflowError } from "../runtime.js";
import { DefaultPolicyEngine } from "../policy/policy-engine.js";
import type {
  ToolExecutionRequest,
  ToolExecutionResponse,
} from "../runtime.js";

export interface RetryPolicy {
  maxAttempts: number;
}

export interface CapabilityTool {
  name: string;
  capability: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
  requiredPermissions: string[];
  requiresConfirmation: boolean;
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  auditRequired: boolean;
  inputSchema?: ToolSchema;
  outputSchema?: ToolSchema;
  prepareArgs?(request: ToolExecutionRequest): Record<string, unknown>;
  execute(
    request: ToolExecutionRequest,
    args: Record<string, unknown>,
  ): Promise<{
    status: "success" | "failed";
    data?: Record<string, unknown>;
    error?: string;
  }>;
}

export interface ToolSchema {
  validate(input: Record<string, unknown>): ToolSchemaValidationResult;
}

export type ToolSchemaValidationResult =
  | {
      valid: true;
    }
  | {
      valid: false;
      message: string;
    };

export class CapabilityToolRegistry {
  private readonly tools = new Map<string, CapabilityTool>();
  private readonly policyEngine = new DefaultPolicyEngine();

  constructor(tools: CapabilityTool[]) {
    for (const tool of tools) {
      this.tools.set(tool.capability, tool);
    }
  }

  listCapabilities(): string[] {
    return [...this.tools.keys()];
  }

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResponse> {
    const tool = this.tools.get(request.capability);
    if (!tool) {
      throw new LangGraphWorkflowError(
        "TOOL_NOT_CONFIGURED",
        `Tool capability ${request.capability} is not configured`,
      );
    }

    const args = tool.prepareArgs?.(request) ?? {};
    const inputValidation = tool.inputSchema?.validate(args) ?? { valid: true };
    if (!inputValidation.valid) {
      throw new LangGraphWorkflowError(
        "TOOL_INPUT_INVALID",
        `Invalid input for ${tool.capability}: ${inputValidation.message}`,
      );
    }

    const policyDecision = this.policyEngine.evaluate({
      riskLevel: tool.riskLevel,
      requiredPermissions: tool.requiredPermissions,
      requiresConfirmation: tool.requiresConfirmation,
      userPermissions: request.userContext.permissions,
    });

    if (!policyDecision.allowed) {
      throw new LangGraphWorkflowError(
        "TOOL_PERMISSION_DENIED",
        policyDecision.reason,
      );
    }

    if (policyDecision.requiresConfirmation) {
      return {
        toolName: tool.name,
        args,
        actionSummary: `${tool.name}: ${request.capability}`,
        riskLevel: tool.riskLevel,
        requiresConfirmation: true,
      };
    }

    const result = await tool.execute(request, args);
    const outputValidation = tool.outputSchema?.validate(result.data ?? {}) ?? {
      valid: true,
    };
    if (!outputValidation.valid) {
      throw new LangGraphWorkflowError(
        "TOOL_OUTPUT_INVALID",
        `Invalid output for ${tool.capability}: ${outputValidation.message}`,
      );
    }

    return {
      toolName: tool.name,
      args,
      actionSummary: `${tool.name}: ${request.capability}`,
      riskLevel: tool.riskLevel,
      requiresConfirmation: false,
      result,
    };
  }
}
