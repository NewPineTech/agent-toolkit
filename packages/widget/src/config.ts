declare const process: { env: Record<string, string | undefined> };

// Bundlers (Vite/tsup) statically replace `process.env.WIDGET_API_URL` with the
// configured value at build time. A try/catch is used instead of a `typeof process`
// guard because the guard short-circuits before the replaced literal is reached,
// leaving API_URL as "" when process is absent in the browser at runtime.
let _apiUrl = "";
try {
  _apiUrl = process.env.WIDGET_API_URL || "";
} catch {
  // process is not available in this browser environment
}
const API_URL: string = _apiUrl;

export function getApiUrl(): string {
  return API_URL;
}
