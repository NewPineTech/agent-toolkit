export interface RagflowProviderConfig {
  baseUrl: string;
  apiKey: string;
  agentId: string;
}

export interface ProviderHealthResult {
  ok: boolean;
  url: string;
  status?: number;
  error?: string;
}

export function buildRagflowAgentUrl(
  baseUrl: string,
  agentId: string,
  path: "sessions" | "completions",
): string {
  return `${normalizeProviderBaseUrl(baseUrl)}/api/v1/agents/${encodeURIComponent(agentId)}/${path}`;
}

export function createRagflowSessionRequest(config: RagflowProviderConfig) {
  return {
    url: buildRagflowAgentUrl(config.baseUrl, config.agentId, "sessions"),
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    } satisfies RequestInit,
  };
}

export async function testRagflowSessionEndpoint(
  config: RagflowProviderConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderHealthResult> {
  const request = createRagflowSessionRequest(config);
  try {
    const response = await fetchImpl(request.url, request.init);
    return {
      ok: response.ok,
      url: request.url,
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      url: request.url,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeProviderBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
