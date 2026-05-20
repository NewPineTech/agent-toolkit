import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgenticInspectorApp } from "./AgenticInspectorApp.js";
import {
  inspectorCapabilities,
  inspectorRunSummaries,
  successEvidenceRun,
  warningEvidenceRun,
} from "./fixtures/agentic-runs.js";

describe("AgenticInspectorApp", () => {
  it("loads run list, selected detail, and capability catalog from admin APIs", async () => {
    const fetcher = createFetcher();

    render(<AgenticInspectorApp adminToken="admin-token" fetcher={fetcher} />);

    await waitFor(() => {
      expect(
        screen.getByLabelText("Run and thread list").textContent,
      ).toContain("run_success_hr_001");
    });
    expect(screen.getByLabelText("Capability catalog").textContent).toContain(
      "hr_recruitment.search_user_guide",
    );
    expect(fetcher).toHaveBeenCalledWith(
      "/admin/agentic/runs?limit=25&offset=0",
      expect.objectContaining({
        headers: { Authorization: "Bearer admin-token" },
      }),
    );
  });

  it("shows unauthorized errors from the admin API", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async (): Promise<string> => "unauthorized",
    });

    render(
      <AgenticInspectorApp adminToken="bad-token" fetcher={fetcher as any} />,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Unauthorized admin inspector request",
      );
    });
  });

  it("loads a new run detail when an inspector run is selected", async () => {
    const fetcher = createFetcher();

    render(<AgenticInspectorApp adminToken="admin-token" fetcher={fetcher} />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: `Open run ${warningEvidenceRun.summary.runId}`,
        }),
      ).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: `Open run ${warningEvidenceRun.summary.runId}`,
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
        warningEvidenceRun.summary.threadId,
      );
    });
    expect(fetcher).toHaveBeenCalledWith(
      `/admin/agentic/runs/${warningEvidenceRun.summary.runId}`,
      expect.objectContaining({
        headers: { Authorization: "Bearer admin-token" },
      }),
    );
  });
});

function createFetcher() {
  return vi.fn(async (url: string) => {
    if (url.startsWith("/admin/agentic/runs?")) {
      return ok({
        items: inspectorRunSummaries,
        limit: 25,
        offset: 0,
        nextOffset: null,
      });
    }
    if (url === "/admin/agentic/runs/run_success_hr_001") {
      return ok(successEvidenceRun);
    }
    if (url === "/admin/agentic/runs/run_warning_hr_002") {
      return ok(warningEvidenceRun);
    }
    if (url === "/admin/agentic/capabilities") {
      return ok({ items: inspectorCapabilities });
    }
    return {
      ok: false,
      status: 404,
      text: async (): Promise<string> => "not found",
    };
  }) as unknown as typeof fetch;
}

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async (): Promise<unknown> => body,
    text: async (): Promise<string> => JSON.stringify(body),
  };
}
