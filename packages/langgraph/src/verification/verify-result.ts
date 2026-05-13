import type { ToolExecutionResult, VerificationResult } from "../state.js";

export function verifyToolResult(
  result: ToolExecutionResult,
): VerificationResult {
  if (result.status === "failed") {
    return {
      status: "failed",
      reason: result.error ?? "Tool execution failed",
    };
  }

  return {
    status: "passed",
  };
}
