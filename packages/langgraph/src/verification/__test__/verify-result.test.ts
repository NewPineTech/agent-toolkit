import { describe, expect, it } from "vitest";
import { verifyToolResult } from "../verify-result.js";

describe("verifyToolResult", () => {
  it("fails verification for failed tool results", () => {
    expect(
      verifyToolResult({
        status: "failed",
        error: "External API failed",
      }),
    ).toEqual({
      status: "failed",
      reason: "External API failed",
    });
  });

  it("passes verification for successful tool results", () => {
    expect(
      verifyToolResult({ status: "success", data: { id: "T-1" } }),
    ).toEqual({
      status: "passed",
    });
  });
});
