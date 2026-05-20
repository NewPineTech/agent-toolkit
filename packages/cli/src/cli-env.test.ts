import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCliEnvDefaults } from "./cli-env.js";

function tempRepo() {
  return mkdtempSync(join(tmpdir(), "agent-toolkit-cli-env-"));
}

describe("loadCliEnvDefaults", () => {
  it("loads missing CLI env values from .env.prod before .env without overriding shell env", () => {
    const cwd = tempRepo();
    const env: NodeJS.ProcessEnv = {
      DATABASE_URL: "postgresql://shell",
    };
    writeFileSync(
      join(cwd, ".env.prod"),
      [
        "DATABASE_URL=postgresql://prod",
        "ENCRYPTION_KEY=prod-secret",
        "WIDGET_API_URL=https://prod.example.com",
      ].join("\n"),
    );
    writeFileSync(
      join(cwd, ".env"),
      [
        "DATABASE_URL=postgresql://dev",
        "ENCRYPTION_KEY=dev-secret",
        "JWT_SECRET=dev-jwt",
      ].join("\n"),
    );

    const loaded = loadCliEnvDefaults({ cwd, env });

    expect(env["DATABASE_URL"]).toBe("postgresql://shell");
    expect(env["ENCRYPTION_KEY"]).toBe("prod-secret");
    expect(env["JWT_SECRET"]).toBe("dev-jwt");
    expect(env["WIDGET_API_URL"]).toBe("https://prod.example.com");
    expect(loaded).toEqual({
      ".env.prod": ["ENCRYPTION_KEY", "WIDGET_API_URL"],
      ".env": ["JWT_SECRET"],
    });
  });

  it("treats blank env-file values as missing so .env can satisfy local CLI commands", () => {
    const cwd = tempRepo();
    const env: NodeJS.ProcessEnv = {};
    writeFileSync(
      join(cwd, ".env.prod"),
      ["DATABASE_URL=", "ENCRYPTION_KEY="].join("\n"),
    );
    writeFileSync(
      join(cwd, ".env"),
      ["DATABASE_URL=postgresql://local", "ENCRYPTION_KEY=local-secret"].join(
        "\n",
      ),
    );

    const loaded = loadCliEnvDefaults({ cwd, env });

    expect(env["DATABASE_URL"]).toBe("postgresql://local");
    expect(env["ENCRYPTION_KEY"]).toBe("local-secret");
    expect(loaded).toEqual({
      ".env.prod": [],
      ".env": ["DATABASE_URL", "ENCRYPTION_KEY"],
    });
  });
});
