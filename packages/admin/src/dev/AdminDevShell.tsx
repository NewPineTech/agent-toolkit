import { useMemo, useState } from "react";
import { Lock, Server, ShieldAlert } from "lucide-react";
import { AgenticInspectorApp } from "../AgenticInspectorApp.js";

const DEFAULT_API_BASE_URL = "http://localhost:3000";

export function AdminDevShell() {
  const configuredToken = import.meta.env.VITE_AGENTIC_ADMIN_TOKEN ?? "";
  const configuredApiBaseUrl =
    import.meta.env.VITE_AGENTIC_ADMIN_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  const [apiBaseUrl, setApiBaseUrl] = useState(configuredApiBaseUrl);
  const [draftToken, setDraftToken] = useState(configuredToken);
  const [adminToken, setAdminToken] = useState(configuredToken);

  const normalizedApiBaseUrl = useMemo(
    () => apiBaseUrl.replace(/\/$/, ""),
    [apiBaseUrl],
  );

  if (!adminToken) {
    return (
      <main style={styles.boot}>
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <ShieldAlert aria-hidden size={22} />
            <div>
              <p style={styles.eyebrow}>Local dev only</p>
              <h1 style={styles.title}>Agentic Admin Inspector</h1>
            </div>
          </div>
          <p style={styles.copy}>
            Start the server with the same admin token, then connect this local
            UI to the read-only inspector APIs.
          </p>
          <label style={styles.field}>
            <span>
              <Server aria-hidden size={15} />
              API base URL
            </span>
            <input
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.currentTarget.value)}
              placeholder={DEFAULT_API_BASE_URL}
              style={styles.input}
            />
          </label>
          <label style={styles.field}>
            <span>
              <Lock aria-hidden size={15} />
              Admin API token
            </span>
            <input
              value={draftToken}
              onChange={(event) => setDraftToken(event.currentTarget.value)}
              placeholder="ADMIN_API_TOKEN"
              style={styles.input}
              type="password"
            />
          </label>
          <button
            disabled={draftToken.trim().length === 0}
            onClick={() => setAdminToken(draftToken.trim())}
            style={styles.button}
            type="button"
          >
            Open Inspector
          </button>
        </section>
      </main>
    );
  }

  return (
    <AgenticInspectorApp
      apiBaseUrl={normalizedApiBaseUrl}
      adminToken={adminToken}
    />
  );
}

const styles = {
  boot: {
    alignItems: "center",
    background: "#f5f7fa",
    color: "#18202b",
    display: "flex",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    justifyContent: "center",
    minHeight: "100vh",
    padding: 24,
  },
  panel: {
    background: "#ffffff",
    border: "1px solid #d8dee6",
    borderRadius: 8,
    boxShadow: "0 20px 60px rgba(24, 32, 43, 0.12)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxWidth: 520,
    padding: 24,
    width: "100%",
  },
  panelHeader: {
    alignItems: "center",
    display: "flex",
    gap: 12,
  },
  eyebrow: {
    color: "#5d6b7a",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0,
    margin: 0,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 24,
    lineHeight: 1.2,
    margin: "4px 0 0",
  },
  copy: {
    color: "#344054",
    fontSize: 14,
    lineHeight: 1.5,
    margin: 0,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    fontSize: 13,
    fontWeight: 700,
    gap: 7,
  },
  input: {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    fontSize: 14,
    height: 38,
    padding: "0 10px",
  },
  button: {
    background: "#18202b",
    border: "1px solid #18202b",
    borderRadius: 8,
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 800,
    height: 40,
  },
} satisfies Record<string, React.CSSProperties>;
