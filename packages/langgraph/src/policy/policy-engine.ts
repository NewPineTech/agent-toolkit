export interface PolicyEvaluationInput {
  riskLevel: "low" | "medium" | "high";
  requiredPermissions: string[];
  requiresConfirmation: boolean;
  userPermissions: string[];
}

export type PolicyDecision =
  | {
      allowed: true;
      requiresConfirmation: boolean;
    }
  | {
      allowed: false;
      reason: string;
    };

export class DefaultPolicyEngine {
  evaluate(input: PolicyEvaluationInput): PolicyDecision {
    const missing = input.requiredPermissions.filter(
      (permission) => !input.userPermissions.includes(permission),
    );

    if (missing.length > 0) {
      return {
        allowed: false,
        reason: `Missing required permissions: ${missing.join(", ")}`,
      };
    }

    return {
      allowed: true,
      requiresConfirmation:
        input.requiresConfirmation || input.riskLevel !== "low",
    };
  }
}
