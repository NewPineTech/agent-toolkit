import { afterEach, describe, expect, it, vi } from "vitest";
import { AgenticInspectorClient } from "./agentic-inspector-client.js";

describe("AgenticInspectorClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("binds the default browser fetch to globalThis", async () => {
    const fetcher = vi.fn(function (this: unknown, _url: string) {
      expect(this).toBe(globalThis);
      return Promise.resolve(ok({ items: [], limit: 25, offset: 0 }));
    });
    vi.stubGlobal("fetch", fetcher);

    const client = new AgenticInspectorClient({ adminToken: "admin-token" });

    await expect(client.listRuns()).resolves.toEqual({
      items: [],
      limit: 25,
      offset: 0,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/admin/agentic/runs",
      expect.objectContaining({
        headers: { Authorization: "Bearer admin-token" },
      }),
    );
  });
});

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async (): Promise<unknown> => body,
    text: async (): Promise<string> => JSON.stringify(body),
  };
}
