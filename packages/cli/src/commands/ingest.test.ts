import { describe, expect, it } from "vitest";
import { resolvePythonCommand, resolveToolDir } from "./ingest.js";

describe("ingest command helpers", () => {
  it("falls back to python3 when python is unavailable", () => {
    expect(resolvePythonCommand({ PATH: "/opt/homebrew/bin" })).toBe("python3");
  });

  it("resolves the repo ingest tool directory even outside the repo root", () => {
    expect(resolveToolDir("/private/tmp")).toContain(
      "tools/ragflow_kb_generater",
    );
  });
});
