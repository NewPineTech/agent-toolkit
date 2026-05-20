import { createRoot } from "react-dom/client";
import { AdminDevShell } from "./AdminDevShell.js";
import { validateLocalAdminDevRuntime } from "./local-only.js";

const runtime = validateLocalAdminDevRuntime(
  import.meta.env.MODE,
  window.location.hostname,
);

const root = createRoot(document.getElementById("root")!);

root.render(
  runtime.allowed ? (
    <AdminDevShell />
  ) : (
    <main
      style={{
        alignItems: "center",
        background: "#111827",
        color: "#f9fafb",
        display: "flex",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        justifyContent: "center",
        minHeight: "100vh",
        padding: 24,
      }}
    >
      <section
        style={{
          border: "1px solid #374151",
          borderRadius: 8,
          maxWidth: 520,
          padding: 24,
        }}
      >
        <p style={{ color: "#fca5a5", fontWeight: 800, margin: "0 0 8px" }}>
          Admin Inspector blocked
        </p>
        <h1 style={{ fontSize: 24, margin: "0 0 10px" }}>
          Local development only
        </h1>
        <p style={{ color: "#d1d5db", lineHeight: 1.5, margin: 0 }}>
          {runtime.reason}
        </p>
      </section>
    </main>
  ),
);
