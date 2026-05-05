import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { embedRoute } from "./embed.route.js";

let tempDir: string | null = null;
const previousBundlePath = process.env.WIDGET_STANDALONE_BUNDLE_PATH;

afterEach(async () => {
  if (previousBundlePath === undefined) {
    delete process.env.WIDGET_STANDALONE_BUNDLE_PATH;
  } else {
    process.env.WIDGET_STANDALONE_BUNDLE_PATH = previousBundlePath;
  }

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("embed route", () => {
  it("serves the standalone widget bundle from an explicit production path", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agent-toolkit-widget-"));
    const bundlePath = join(tempDir, "standalone.global.js");
    await writeFile(bundlePath, "window.AgentToolkitWidget = {};", "utf-8");
    process.env.WIDGET_STANDALONE_BUNDLE_PATH = bundlePath;

    const app = Fastify({ logger: false });
    await app.register(embedRoute);

    const response = await app.inject({
      method: "GET",
      url: "/widget/widget.js?workspaceId=ws_test",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain(
      "application/javascript",
    );
    expect(response.body).toBe("window.AgentToolkitWidget = {};");

    await app.close();
  });
});
