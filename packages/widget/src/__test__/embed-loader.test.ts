import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  getApiUrl: () => "",
}));

describe("embed loader", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("supports relative embed URLs when WIDGET_API_URL is not configured", async () => {
    const { createChatIframe, getEmbedSnippet } =
      await import("../embed-loader.js");

    const iframe = createChatIframe({ workspaceId: "ws_dev_001" });
    const snippet = getEmbedSnippet({ workspaceId: "ws_dev_001" });

    expect(iframe.getAttribute("src")).toContain(
      "/widget/embed?workspaceId=ws_dev_001",
    );
    expect(snippet).toContain('src="/widget/embed?workspaceId=ws_dev_001');
  });
});
