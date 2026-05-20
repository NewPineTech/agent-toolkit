import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EvidenceInspector } from "./EvidenceInspector.js";
import {
  blockedEvidenceRun,
  failedToolCallRun,
  inspectorCapabilities,
  inspectorRunSummaries,
  successEvidenceRun,
  warningEvidenceRun,
} from "./fixtures/agentic-runs.js";

describe("EvidenceInspector", () => {
  it("renders the dense three-pane inspector shell with filters, runs, timeline, and detail tabs", () => {
    render(
      <EvidenceInspector
        runs={inspectorRunSummaries}
        selectedRun={successEvidenceRun}
        capabilities={inspectorCapabilities}
      />,
    );

    expect(screen.getByRole("banner").textContent).toContain("Agentic Runs");
    expect(screen.getByLabelText("Search runs")).toBeTruthy();
    expect(screen.getByLabelText("Workspace filter")).toBeTruthy();
    expect(screen.getByLabelText("Intent filter")).toBeTruthy();
    expect(screen.getByLabelText("Status filter")).toBeTruthy();
    expect(screen.getByLabelText("Run and thread list").textContent).toContain(
      "run_success_hr_001",
    );
    expect(screen.getByLabelText("Logical timeline").textContent).toContain(
      "Capability plan",
    );
    expect(
      screen.getByLabelText("Graph path visualization").textContent,
    ).toContain("Executed Path");
    expect(screen.getByLabelText("Capability catalog").textContent).toContain(
      "hr_recruitment.search_user_guide",
    );
    expect(screen.getByLabelText("Capability catalog").textContent).toContain(
      "approval required",
    );

    for (const tabName of [
      "State",
      "Tool Calls",
      "Sources",
      "Missing Evidence",
      "Confidence",
      "JSON",
    ]) {
      expect(screen.getByRole("tab", { name: tabName })).toBeTruthy();
    }
  });

  it("surfaces warning, blocking, failed-tool, and no-evidence fixture states in the run list", () => {
    render(
      <EvidenceInspector
        runs={inspectorRunSummaries}
        selectedRun={warningEvidenceRun}
        capabilities={inspectorCapabilities}
      />,
    );

    expect(screen.getAllByText("warning").length).toBeGreaterThan(0);
    expect(screen.getAllByText("blocked").length).toBeGreaterThan(0);
    expect(screen.getAllByText("failed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("no evidence").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Run and thread list").textContent).toContain(
      blockedEvidenceRun.summary.runId,
    );
    expect(screen.getByLabelText("Run and thread list").textContent).toContain(
      failedToolCallRun.summary.runId,
    );
  });

  it("renders loading, error, and empty states without live API wiring", () => {
    const { rerender } = render(
      <EvidenceInspector runs={[]} state="loading" />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Loading agentic runs",
    );

    rerender(
      <EvidenceInspector
        runs={[]}
        state="error"
        errorMessage="Admin API unavailable"
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Admin API unavailable",
    );

    rerender(<EvidenceInspector runs={[]} />);
    expect(screen.getByText("No agentic run evidence yet")).toBeTruthy();
  });

  it("maps filter controls to the supplied change handler and renders stale state", () => {
    const changes: unknown[] = [];
    render(
      <EvidenceInspector
        runs={inspectorRunSummaries}
        selectedRun={successEvidenceRun}
        stale
        filters={{ limit: 25, offset: 0 }}
        onFiltersChange={(next) => changes.push(next)}
      />,
    );

    fireEvent.change(screen.getByLabelText("Search runs"), {
      target: { value: "thread_1" },
    });
    expect(changes).toEqual([
      expect.objectContaining({ threadId: "thread_1", offset: 0 }),
    ]);
    expect(screen.getByText("Showing stale data")).toBeTruthy();
  });

  it("wires inspector actions for refresh, run selection, graph, tabs, expand, and copy", async () => {
    const onRefresh = vi.fn();
    const onRunSelect = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <EvidenceInspector
        runs={inspectorRunSummaries}
        selectedRun={successEvidenceRun}
        capabilities={inspectorCapabilities}
        onRefresh={onRefresh}
        onRunSelect={onRunSelect}
      />,
    );

    fireEvent.click(screen.getByLabelText("Refresh agentic runs"));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", {
        name: `Open run ${warningEvidenceRun.summary.runId}`,
      }),
    );
    expect(onRunSelect).toHaveBeenCalledWith(warningEvidenceRun.summary.runId);

    const graphToggle = screen.getByLabelText("Toggle graph view");
    expect(graphToggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(graphToggle);
    expect(graphToggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByLabelText("Graph path visualization")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Tool Calls" }));
    expect(
      screen
        .getByRole("tab", { name: "Tool Calls" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("ragflow.retrieve")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Sources" }));
    expect(screen.getAllByText("Leave Policy Handbook").length).toBeGreaterThan(
      0,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Confidence" }));
    expect(screen.getByText("Policy document match")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "State" }));
    const expandButton = screen.getByLabelText("Expand state detail");
    expect(expandButton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(expandButton);
    expect(expandButton.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: "JSON" }));
    fireEvent.click(screen.getByLabelText("Copy JSON"));
    expect(writeText).toHaveBeenCalledWith(
      JSON.stringify(successEvidenceRun.rawJson.value, null, 2),
    );
    await waitFor(() => {
      expect(screen.getByText("Copied JSON")).toBeTruthy();
    });
  });
});
