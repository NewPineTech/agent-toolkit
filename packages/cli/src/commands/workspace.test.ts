import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CliContext } from "../context.js";
import * as db from "../db.js";
import * as workspace from "./workspace.js";

vi.mock("../db.js", () => ({
  createPool: vi.fn(),
  encryptSecret: vi.fn((value: string) => `encrypted:${value}`),
  findWorkspace: vi.fn(),
  getNextGeneratedWorkspaceId: vi.fn(),
  listWorkspaceSummaries: vi.fn(),
  parseDomains: vi.fn((domains?: string) =>
    domains ? domains.split(",").map((domain) => domain.trim()) : [],
  ),
  parsePositiveInteger: vi.fn(
    (value?: string, defaultValue?: number) =>
      (value ? Number(value) : defaultValue) as number | undefined,
  ),
}));

type WorkspaceWithGuidedCreate = typeof workspace & {
  runGuidedWorkspaceCreate?: (
    context: CliContext,
    options: {
      providerType?: string;
      agentId?: string;
      apiKey?: string;
      baseUrl?: string;
      domains?: string;
      authMode?: string;
      authSecret?: string;
      maxRequests?: string;
      windowMs?: string;
      maxMessageLength?: string;
    },
  ) => Promise<string>;
};

const mockCreatePool = vi.mocked(db.createPool);
const mockGetNextGeneratedWorkspaceId = vi.mocked(
  (db as typeof db & { getNextGeneratedWorkspaceId: () => Promise<string> })
    .getNextGeneratedWorkspaceId,
);

function createContext() {
  const output: string[] = [];
  return {
    context: {
      stdout: (message: string) => output.push(message),
      stderr: vi.fn(),
    },
    output,
  };
}

function duplicateWorkspaceError() {
  return Object.assign(
    new Error("duplicate key value violates unique constraint"),
    {
      code: "23505",
    },
  );
}

describe("workspace guided create command helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries generated workspace IDs on duplicate conflicts and returns the saved ID", async () => {
    const commands = workspace as WorkspaceWithGuidedCreate;
    expect(typeof commands.runGuidedWorkspaceCreate).toBe("function");

    const pool = {
      query: vi
        .fn()
        .mockRejectedValueOnce(duplicateWorkspaceError())
        .mockResolvedValueOnce({ rowCount: 1 }),
      end: vi.fn().mockResolvedValue(undefined),
    };
    mockCreatePool.mockReturnValue(pool as never);
    mockGetNextGeneratedWorkspaceId
      .mockResolvedValueOnce("ws_2")
      .mockResolvedValueOnce("ws_3");
    const { context, output } = createContext();

    await expect(
      commands.runGuidedWorkspaceCreate!(context, {
        agentId: "agent_1",
        apiKey: "secret",
        baseUrl: "https://ragflow.example.com",
      }),
    ).resolves.toBe("ws_3");

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls[0]?.[1]?.[0]).toBe("ws_2");
    expect(pool.query.mock.calls[1]?.[1]?.[0]).toBe("ws_3");
    expect(output.join("")).toContain('Workspace "ws_3" saved.');
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("fails with manual ID guidance after bounded duplicate retries", async () => {
    const commands = workspace as WorkspaceWithGuidedCreate;
    expect(typeof commands.runGuidedWorkspaceCreate).toBe("function");

    const pool = {
      query: vi.fn().mockRejectedValue(duplicateWorkspaceError()),
      end: vi.fn().mockResolvedValue(undefined),
    };
    mockCreatePool.mockReturnValue(pool as never);
    mockGetNextGeneratedWorkspaceId.mockResolvedValue("ws_9");
    const { context } = createContext();

    await expect(
      commands.runGuidedWorkspaceCreate!(context, {
        agentId: "agent_1",
        apiKey: "secret",
        baseUrl: "https://ragflow.example.com",
      }),
    ).rejects.toThrow(
      "Could not create a workspace after 5 generated ID attempts. Choose a manual workspace ID and try again.",
    );
    expect(pool.query).toHaveBeenCalledTimes(5);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});
