import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatOperatorDefaultForReview,
  getLangGraphBaseUrlDefault,
  resolveOperatorDefault,
} from "./operator-defaults.js";

function tempRepo() {
  return mkdtempSync(join(tmpdir(), "agent-toolkit-defaults-"));
}

describe("operator defaults", () => {
  it("uses process.env before .env.prod and .env", () => {
    const cwd = tempRepo();
    writeFileSync(join(cwd, ".env.prod"), "WIDGET_API_URL=https://prod.test\n");
    writeFileSync(join(cwd, ".env"), "WIDGET_API_URL=https://dev.test\n");

    expect(
      resolveOperatorDefault("WIDGET_API_URL", {
        cwd,
        env: { WIDGET_API_URL: "https://shell.test" },
      }),
    ).toEqual({
      name: "WIDGET_API_URL",
      secret: false,
      value: "https://shell.test",
      source: "process.env",
    });
  });

  it("uses .env.prod before .env when shell env is missing", () => {
    const cwd = tempRepo();
    writeFileSync(join(cwd, ".env.prod"), "LANGGRAPH_API_KEY=prod-secret\n");
    writeFileSync(join(cwd, ".env"), "LANGGRAPH_API_KEY=dev-secret\n");

    expect(
      resolveOperatorDefault("LANGGRAPH_API_KEY", { cwd, env: {} }),
    ).toEqual({
      name: "LANGGRAPH_API_KEY",
      secret: true,
      value: "prod-secret",
      source: ".env.prod",
    });
  });

  it("returns undefined value and source when no default exists", () => {
    const cwd = tempRepo();

    expect(resolveOperatorDefault("WIDGET_API_URL", { cwd, env: {} })).toEqual({
      name: "WIDGET_API_URL",
      secret: false,
      value: undefined,
      source: "missing",
    });
  });

  it("builds LangGraph base URL from Docker or host context", () => {
    expect(
      getLangGraphBaseUrlDefault({
        runningInDocker: true,
        port: {
          value: "2026",
          source: ".env.prod",
          name: "LANGGRAPH_PORT",
          secret: false,
        },
      }),
    ).toEqual({
      value: "http://langgraph:2024",
      source: "docker",
    });

    expect(
      getLangGraphBaseUrlDefault({
        runningInDocker: false,
        port: {
          value: "2026",
          source: ".env",
          name: "LANGGRAPH_PORT",
          secret: false,
        },
      }),
    ).toEqual({
      value: "http://localhost:2026",
      source: ".env",
    });
  });

  it("does not render secret values in review text", () => {
    expect(
      formatOperatorDefaultForReview({
        name: "LANGGRAPH_API_KEY",
        secret: true,
        source: ".env.prod",
        value: "super-secret",
      }),
    ).toBe("LANGGRAPH_API_KEY: [hidden] (from .env.prod)");
  });
});
