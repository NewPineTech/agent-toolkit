import type { z } from "zod";
import type { AgenticIntent } from "../constants.js";
import type { AgenticEvidence } from "../state.js";

export type AgenticCapabilityKind =
  | "retriever"
  | "mcp_tool"
  | "resolver"
  | "verifier";

export interface AgenticCapabilitySafety {
  readOnly: boolean;
  requiresApproval: boolean;
}

export interface AgenticCapabilityContext {
  capabilityId: string;
  intent: AgenticIntent;
  kind: AgenticCapabilityKind;
}

export interface AgenticCapability<Input = unknown, Output = unknown> {
  id: string;
  intent: AgenticIntent;
  kind: AgenticCapabilityKind;
  inputSchema: z.ZodType<Input>;
  outputSchema: z.ZodType<Output>;
  safety: AgenticCapabilitySafety;
  execute(input: Input, context: AgenticCapabilityContext): Promise<Output>;
}

export type AgenticCapabilityExecutionStatus = "success" | "skipped" | "failed";

export interface AgenticCapabilityExecutionRequest {
  capabilityId: string;
  input: unknown;
  maxSteps: number;
  approvalGranted?: boolean;
}

export interface AgenticCapabilityExecutionResult<Output = unknown> {
  status: AgenticCapabilityExecutionStatus;
  capabilityId: string;
  output?: Output;
  evidence: AgenticEvidence;
  warningCodes: string[];
  errorMessage?: string;
}
