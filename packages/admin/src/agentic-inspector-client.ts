import type {
  AdminAgenticCapabilityCatalogEntry,
  AdminAgenticRunDetail,
  AdminAgenticRunStatus,
  AdminAgenticRunSummary,
} from "@agent-toolkit/types";

export interface AgenticInspectorFilters {
  workspaceId?: string;
  threadId?: string;
  intent?: string;
  status?: AdminAgenticRunStatus;
  limit?: number;
  offset?: number;
}

export interface AgenticRunListResponse {
  items: AdminAgenticRunSummary[];
  limit: number;
  offset: number;
  nextOffset: number | null;
}

export interface AgenticCapabilityCatalogResponse {
  items: AdminAgenticCapabilityCatalogEntry[];
}

export interface AgenticInspectorClientOptions {
  apiBaseUrl?: string;
  adminToken: string;
  fetcher?: typeof fetch;
}

export class AgenticInspectorClient {
  private readonly apiBaseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: AgenticInspectorClientOptions) {
    this.apiBaseUrl = options.apiBaseUrl?.replace(/\/$/, "") ?? "";
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  async listRuns(
    filters: AgenticInspectorFilters = {},
  ): Promise<AgenticRunListResponse> {
    return this.getJson(`/admin/agentic/runs${queryString(filters)}`);
  }

  async getRun(runId: string): Promise<AdminAgenticRunDetail> {
    return this.getJson(`/admin/agentic/runs/${encodeURIComponent(runId)}`);
  }

  async listCapabilities(): Promise<AgenticCapabilityCatalogResponse> {
    return this.getJson("/admin/agentic/capabilities");
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.fetcher(`${this.apiBaseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.options.adminToken}`,
      },
    });

    if (!response.ok) {
      throw new AgenticInspectorClientError(
        response.status,
        await response.text(),
      );
    }

    return (await response.json()) as T;
  }
}

export class AgenticInspectorClientError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Agentic inspector API returned ${status}`);
  }
}

function queryString(filters: AgenticInspectorFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}
