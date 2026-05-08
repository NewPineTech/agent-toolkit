import { describe, expect, it } from "vitest";
import { parseDomains, parsePositiveInteger } from "../index.js";

describe("workspace option helpers", () => {
  it("parses comma-separated domains", () => {
    expect(parseDomains(" https://a.com,*.b.com, ")).toEqual([
      "https://a.com",
      "*.b.com",
    ]);
  });

  it("parses positive integers with optional fallback", () => {
    expect(parsePositiveInteger(undefined, 30)).toBe(30);
    expect(parsePositiveInteger("10")).toBe(10);
    expect(() => parsePositiveInteger("0")).toThrow(
      'Expected a positive integer, got "0"',
    );
  });
});
