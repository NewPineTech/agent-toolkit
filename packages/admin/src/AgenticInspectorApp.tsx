import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AdminAgenticCapabilityCatalogEntry,
  AdminAgenticRunDetail,
  AdminAgenticRunSummary,
} from "@agent-toolkit/types";
import { EvidenceInspector } from "./EvidenceInspector.js";
import {
  AgenticInspectorClient,
  AgenticInspectorClientError,
  type AgenticInspectorFilters,
} from "./agentic-inspector-client.js";

export interface AgenticInspectorAppProps {
  apiBaseUrl?: string;
  adminToken: string;
  initialRunId?: string;
  fetcher?: typeof fetch;
}

export function AgenticInspectorApp({
  apiBaseUrl,
  adminToken,
  initialRunId,
  fetcher,
}: AgenticInspectorAppProps) {
  const client = useMemo(
    () => new AgenticInspectorClient({ apiBaseUrl, adminToken, fetcher }),
    [apiBaseUrl, adminToken, fetcher],
  );
  const [runs, setRuns] = useState<AdminAgenticRunSummary[]>([]);
  const [capabilities, setCapabilities] = useState<
    AdminAgenticCapabilityCatalogEntry[]
  >([]);
  const [selectedRun, setSelectedRun] = useState<AdminAgenticRunDetail>();
  const [filters, setFilters] = useState<AgenticInspectorFilters>({
    limit: 25,
    offset: 0,
  });
  const [state, setState] = useState<"ready" | "loading" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>();
  const [stale, setStale] = useState(false);
  const hasLoadedData = useRef(false);

  const load = useCallback(async () => {
    setState("loading");
    setErrorMessage(undefined);
    try {
      const [runList, catalog] = await Promise.all([
        client.listRuns(filters),
        client.listCapabilities(),
      ]);
      setRuns(runList.items);
      setCapabilities(catalog.items);

      const selectedId = initialRunId ?? runList.items[0]?.runId;
      setSelectedRun(selectedId ? await client.getRun(selectedId) : undefined);
      hasLoadedData.current = true;
      setStale(false);
      setState("ready");
    } catch (error) {
      setState("error");
      setErrorMessage(errorToMessage(error));
      setStale(hasLoadedData.current);
    }
  }, [client, filters, initialRunId]);

  const selectRun = useCallback(
    async (runId: string) => {
      setState("loading");
      setErrorMessage(undefined);
      try {
        setSelectedRun(await client.getRun(runId));
        setStale(false);
        setState("ready");
      } catch (error) {
        setState("error");
        setErrorMessage(errorToMessage(error));
        setStale(hasLoadedData.current);
      }
    },
    [client],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <EvidenceInspector
      runs={runs}
      selectedRun={selectedRun}
      capabilities={capabilities}
      state={state}
      errorMessage={errorMessage}
      stale={stale}
      filters={filters}
      onFiltersChange={setFilters}
      onRefresh={() => void load()}
      onRunSelect={(runId) => void selectRun(runId)}
    />
  );
}

function errorToMessage(error: unknown): string {
  if (error instanceof AgenticInspectorClientError) {
    if (error.status === 401) return "Unauthorized admin inspector request";
    if (error.status === 503) return "Admin inspector is not configured";
    return `Admin API returned ${error.status}`;
  }
  return error instanceof Error ? error.message : "Admin API unavailable";
}
