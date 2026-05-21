import { describe, expect, it } from "vitest";
import { MARKDOWN_CSS } from "./styles.js";

describe("widget markdown styles", () => {
  it("keeps ordered process lists readable inside assistant bubbles", () => {
    expect(MARKDOWN_CSS).toContain("padding-left: 18px");
    expect(MARKDOWN_CSS).toContain("margin: 4px 0");
    expect(MARKDOWN_CSS).toContain("overflow-wrap: anywhere");
  });
});
