import type { CliContext } from "../context.js";
import { writeLine } from "../context.js";

interface WidgetOptions {
  apiUrl: string;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  greeting?: string;
  suggestions?: string;
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  position?: string;
  initialOpen?: boolean;
  origin?: string;
}

export function runWidgetIframe(context: CliContext, workspaceId: string, options: WidgetOptions) {
  const title = escapeHtml(options.title ?? "Chat Widget");
  writeLine(
    context,
    `<iframe src="${escapeHtml(buildEmbedUrl(workspaceId, options))}" width="400" height="600" style="border:none;border-radius:12px" allow="clipboard-write" title="${title}"></iframe>`,
  );
}

export function runWidgetScript(context: CliContext, workspaceId: string, options: WidgetOptions) {
  const attrs = [
    `src="${escapeHtml(normalizeApiUrl(options.apiUrl))}/widget/widget.js"`,
    `data-workspace-id="${escapeHtml(workspaceId)}"`,
    options.title ? `data-title="${escapeHtml(options.title)}"` : null,
    options.subtitle ? `data-subtitle="${escapeHtml(options.subtitle)}"` : null,
    options.placeholder ? `data-placeholder="${escapeHtml(options.placeholder)}"` : null,
    options.greeting ? `data-greeting="${escapeHtml(options.greeting)}"` : null,
    options.suggestions ? `data-suggestions="${escapeHtml(options.suggestions)}"` : null,
    options.primaryColor ? `data-primary-color="${escapeHtml(options.primaryColor)}"` : null,
    options.backgroundColor ? `data-background-color="${escapeHtml(options.backgroundColor)}"` : null,
    options.textColor ? `data-text-color="${escapeHtml(options.textColor)}"` : null,
    options.position ? `data-position="${escapeHtml(options.position)}"` : null,
    options.initialOpen ? `data-initial-open="true"` : null,
  ].filter(Boolean);
  writeLine(context, `<script ${attrs.join(" ")}></script>`);
}

export function runWidgetSnippet(context: CliContext, workspaceId: string, options: WidgetOptions) {
  const url = buildEmbedUrl(workspaceId, options);
  const origin = new URL(url).origin;
  writeLine(
    context,
    `<!-- Agent Toolkit Chat Widget -->
<iframe id="agent-toolkit-chat" src="${escapeHtml(url)}" style="border:none;position:fixed;bottom:0;right:0;width:100%;height:100%;z-index:99999;background:transparent" allow="clipboard-write" allowtransparency="true" title="${escapeHtml(options.title ?? "Chat Widget")}"></iframe>
<script>
window.addEventListener('message',function(e){
  if(e.origin!=='${escapeJs(origin)}')return;
  if(e.data&&e.data.source==='agent-toolkit-widget'&&e.data.size){
    var f=document.getElementById('agent-toolkit-chat');
    if(f){f.style.width=e.data.size.width+'px';f.style.height=e.data.size.height+'px'}
  }
});
</script>`,
  );
}

export function runWidgetPreview(context: CliContext, workspaceId: string, options: WidgetOptions) {
  writeLine(context, buildEmbedUrl(workspaceId, options));
}

export async function runWidgetTest(context: CliContext, workspaceId: string, options: WidgetOptions) {
  const headers = options.origin ? { Origin: options.origin } : undefined;
  const response = await fetch(buildEmbedUrl(workspaceId, options), { headers });
  writeLine(context, `Widget embed: HTTP ${response.status}`);
  if (!response.ok) process.exitCode = 1;
}

export function buildEmbedUrl(workspaceId: string, options: WidgetOptions): string {
  const params = new URLSearchParams();
  params.set("workspaceId", workspaceId);
  const fieldMap: Array<[keyof WidgetOptions, string]> = [
    ["title", "title"],
    ["subtitle", "subtitle"],
    ["placeholder", "placeholder"],
    ["greeting", "greeting"],
    ["suggestions", "suggestions"],
    ["primaryColor", "primaryColor"],
    ["backgroundColor", "backgroundColor"],
    ["textColor", "textColor"],
    ["position", "position"],
  ];
  for (const [key, param] of fieldMap) {
    const value = options[key];
    if (typeof value === "string" && value.length > 0) params.set(param, value);
  }
  if (options.initialOpen) params.set("initialOpen", "true");
  return `${normalizeApiUrl(options.apiUrl)}/widget/embed?${params.toString()}`;
}

function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeJs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
