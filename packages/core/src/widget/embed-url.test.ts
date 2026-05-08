import { describe, expect, it } from "vitest";
import {
  buildWidgetEmbedUrl,
  normalizeApiUrl,
  renderWidgetIframe,
  renderWidgetSnippet,
} from "../index.js";

describe("widget embed URL helpers", () => {
  it("normalizes API URLs", () => {
    expect(normalizeApiUrl("https://api.example.com///")).toBe(
      "https://api.example.com",
    );
  });

  it("builds embed URLs from the shared option map", () => {
    expect(
      buildWidgetEmbedUrl("ws_acme", {
        apiUrl: "https://api.example.com/",
        title: "Acme Assistant",
        primaryColor: "#D4775A",
        initialOpen: true,
      }),
    ).toBe(
      "https://api.example.com/widget/embed?workspaceId=ws_acme&title=Acme+Assistant&primaryColor=%23D4775A&initialOpen=true",
    );
  });

  it("renders escaped iframe markup from the shared template", () => {
    expect(
      renderWidgetIframe({
        url: "https://api.example.com/widget/embed?workspaceId=ws&title=%22",
        title: 'Acme "Assistant"',
      }),
    ).toBe(
      '<iframe src="https://api.example.com/widget/embed?workspaceId=ws&amp;title=%22" width="400" height="600" style="border:none;border-radius:12px" allow="clipboard-write" title="Acme &quot;Assistant&quot;"></iframe>',
    );
  });

  it("renders escaped resize snippet markup from the shared template", () => {
    const snippet = renderWidgetSnippet({
      url: "https://api.example.com/widget/embed?workspaceId=ws",
      title: "Acme Assistant",
      expectedOrigin: "https://api.example.com",
      position: "bottom-left",
    });

    expect(snippet).toContain('id="agent-toolkit-chat"');
    expect(snippet).toContain("left:0;width:100%;height:100%");
    expect(snippet).toContain("if(e.origin!=='https://api.example.com')return");
  });
});
