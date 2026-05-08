import { describe, expect, it, vi } from "vitest";
import {
  addUpdateField,
  buildOriginHeaders,
  normalizeApiUrl,
  requiredOption,
  withPool,
} from "./shared.js";

describe("CLI command shared helpers", () => {
  it("normalizes API URLs consistently", () => {
    expect(normalizeApiUrl("https://api.example.com///")).toBe(
      "https://api.example.com",
    );
    expect(normalizeApiUrl("https://api.example.com/v1")).toBe(
      "https://api.example.com/v1",
    );
  });

  it("builds Origin headers only when an origin is provided", () => {
    expect(buildOriginHeaders()).toEqual({});
    expect(buildOriginHeaders("https://customer.example")).toEqual({
      Origin: "https://customer.example",
    });
  });

  it("requires command options with a stable error message", () => {
    expect(requiredOption("value", "apiKey")).toBe("value");
    expect(() => requiredOption(undefined, "apiKey")).toThrow(
      "apiKey is required",
    );
  });

  it("tracks update fields with positional SQL placeholders", () => {
    const fields: string[] = [];
    const values: unknown[] = [];

    addUpdateField(fields, values, "provider_type", "ragflow");
    addUpdateField(fields, values, "auth_secret", undefined);
    addUpdateField(fields, values, "allowed_domains", ["https://example.com"]);

    expect(fields).toEqual(["provider_type = $1", "allowed_domains = $2"]);
    expect(values).toEqual(["ragflow", ["https://example.com"]]);
  });

  it("always closes database pools after successful and failed work", async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    const pool = { end };

    await expect(
      withPool(
        () => pool,
        async (providedPool) => {
          expect(providedPool).toBe(pool);
          return "ok";
        },
      ),
    ).resolves.toBe("ok");
    expect(end).toHaveBeenCalledTimes(1);

    await expect(
      withPool(
        () => pool,
        async () => {
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow("boom");
    expect(end).toHaveBeenCalledTimes(2);
  });
});
