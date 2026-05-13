import { describe, expect, it } from "vitest";
import { DefaultPolicyEngine } from "../policy-engine.js";

describe("DefaultPolicyEngine", () => {
  it("requires confirmation for medium and high risk actions", () => {
    const engine = new DefaultPolicyEngine();

    expect(
      engine.evaluate({
        riskLevel: "medium",
        requiredPermissions: [],
        requiresConfirmation: false,
        userPermissions: [],
      }),
    ).toEqual({
      allowed: true,
      requiresConfirmation: true,
    });
  });

  it("denies actions when required permissions are missing", () => {
    const engine = new DefaultPolicyEngine();

    expect(
      engine.evaluate({
        riskLevel: "low",
        requiredPermissions: ["docs:read"],
        requiresConfirmation: false,
        userPermissions: [],
      }),
    ).toEqual({
      allowed: false,
      reason: "Missing required permissions: docs:read",
    });
  });
});
