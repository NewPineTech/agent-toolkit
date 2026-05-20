import { createEmptyAgenticEvidence } from "../state.js";
import type { AgenticCapabilityRegistry } from "./registry.js";
import type {
  AgenticCapability,
  AgenticCapabilityExecutionRequest,
  AgenticCapabilityExecutionResult,
} from "./types.js";

export async function executeAgenticCapability<Output = unknown>(
  registry: AgenticCapabilityRegistry,
  request: AgenticCapabilityExecutionRequest,
): Promise<AgenticCapabilityExecutionResult<Output>> {
  const capability = registry.get(request.capabilityId);
  if (!capability) {
    return buildResult(request.capabilityId, "failed", [
      "CAPABILITY_NOT_FOUND",
    ]);
  }

  if (request.maxSteps <= 0) {
    return buildResult(capability.id, "skipped", [
      "CAPABILITY_STEP_BUDGET_EXCEEDED",
    ]);
  }

  if (
    (!capability.safety.readOnly || capability.safety.requiresApproval) &&
    !request.approvalGranted
  ) {
    return buildResult(capability.id, "skipped", [
      "CAPABILITY_APPROVAL_REQUIRED",
    ]);
  }

  const parsedInput = capability.inputSchema.safeParse(request.input);
  if (!parsedInput.success) {
    return buildResult(capability.id, "failed", ["CAPABILITY_INPUT_INVALID"]);
  }

  try {
    const output = await capability.execute(parsedInput.data, {
      capabilityId: capability.id,
      intent: capability.intent,
      kind: capability.kind,
    });

    const parsedOutput = capability.outputSchema.safeParse(output);
    if (!parsedOutput.success) {
      return buildResult(capability.id, "failed", [
        "CAPABILITY_OUTPUT_INVALID",
      ]);
    }

    return buildResult<Output>(
      capability.id,
      "success",
      [],
      capability,
      parsedOutput.data as Output,
    );
  } catch (error) {
    return buildResult(
      capability.id,
      "failed",
      ["CAPABILITY_EXECUTION_FAILED"],
      {
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    );
  }
}

function buildResult<Output = unknown>(
  capabilityId: string,
  status: AgenticCapabilityExecutionResult["status"],
  warningCodes: string[],
  capabilityOrOptions?:
    | AgenticCapability
    | {
        errorMessage?: string;
      },
  output?: Output,
): AgenticCapabilityExecutionResult<Output> {
  const capability =
    capabilityOrOptions && "id" in capabilityOrOptions
      ? capabilityOrOptions
      : undefined;
  const errorMessage =
    capabilityOrOptions && !("id" in capabilityOrOptions)
      ? capabilityOrOptions.errorMessage
      : undefined;
  const evidence = createEmptyAgenticEvidence();

  evidence.toolCalls.push({
    toolName: capability?.id ?? capabilityId,
    capabilityId,
    status: status === "success" ? "executed" : status,
    ...(warningCodes.length > 0 ? { warningCodes } : {}),
  });

  return {
    status,
    capabilityId,
    ...(output !== undefined ? { output } : {}),
    evidence,
    warningCodes,
    ...(errorMessage ? { errorMessage } : {}),
  };
}
