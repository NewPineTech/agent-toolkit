import { beforeEach, describe, expect, it, vi } from "vitest";
import { runDomainTest } from "../domain.js";
import { findWorkspace } from "../../db.js";

vi.mock("../../db.js", () => ({
  createPool: () => ({
    query: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  }),
  findWorkspace: vi.fn(),
}));

const mockFindWorkspace = vi.mocked(findWorkspace);

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

describe("domain test command", () => {
  beforeEach(() => {
    mockFindWorkspace.mockReset();
    process.exitCode = undefined;
  });

  it("uses production allowlist behavior for empty domain lists", async () => {
    const { context, output } = createContext();
    mockFindWorkspace.mockResolvedValue({
      allowed_domains: [],
    } as unknown as Awaited<ReturnType<typeof findWorkspace>>);

    await runDomainTest(context, "ws_test", {
      origin: "https://example.com",
    });

    expect(output.join("")).toContain("https://example.com: blocked");
    expect(process.exitCode).toBe(1);
  });

  it("uses production allowlist behavior for wildcard domains", async () => {
    const { context, output } = createContext();
    mockFindWorkspace.mockResolvedValue({
      allowed_domains: ["*.example.com"],
    } as unknown as Awaited<ReturnType<typeof findWorkspace>>);

    await runDomainTest(context, "ws_test", {
      origin: "https://app.example.com",
    });

    expect(output.join("")).toContain("https://app.example.com: allowed");
    expect(process.exitCode).toBeUndefined();
  });
});
