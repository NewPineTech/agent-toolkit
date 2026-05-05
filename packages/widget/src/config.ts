declare const process: { env: Record<string, string | undefined> } | undefined;

const API_URL: string =
  (typeof process !== "undefined" && process?.env?.WIDGET_API_URL) || "";

export function getApiUrl(): string {
  return API_URL;
}
