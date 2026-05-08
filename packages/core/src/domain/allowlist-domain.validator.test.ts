import { describe, expect, it } from "vitest";
import { AllowlistDomainValidator } from "../index.js";

describe("AllowlistDomainValidator", () => {
  const validator = new AllowlistDomainValidator();

  it("rejects an empty allowlist", () => {
    expect(validator.validate("https://example.com", [])).toBe(false);
  });

  it("rejects a missing origin", () => {
    expect(validator.validate(null, ["https://example.com"])).toBe(false);
    expect(validator.validate(undefined, ["https://example.com"])).toBe(false);
  });

  it("rejects an invalid origin", () => {
    expect(validator.validate("not a url", ["*"])).toBe(false);
  });

  it("matches an exact origin", () => {
    expect(
      validator.validate("https://example.com", ["https://example.com"]),
    ).toBe(true);
  });

  it("matches wildcard subdomains and the root domain", () => {
    expect(
      validator.validate("https://app.example.com", ["*.example.com"]),
    ).toBe(true);
    expect(validator.validate("https://example.com", ["*.example.com"])).toBe(
      true,
    );
  });

  it("normalizes a trailing slash", () => {
    expect(
      validator.validate("https://example.com/", ["https://example.com"]),
    ).toBe(true);
  });

  it("normalizes case", () => {
    expect(
      validator.validate("https://EXAMPLE.com", ["https://example.COM"]),
    ).toBe(true);
  });

  it("allows any valid origin for the global wildcard", () => {
    expect(validator.validate("https://customer.example", ["*"])).toBe(true);
  });
});
