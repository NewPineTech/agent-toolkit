export const WIDGET_EMBED_OPTION_KEYS = [
  "title",
  "subtitle",
  "placeholder",
  "greeting",
  "suggestions",
  "primaryColor",
  "backgroundColor",
  "textColor",
  "fontFamily",
  "borderRadius",
  "position",
  "initialOpen",
  "parentOrigin",
] as const;

export type WidgetEmbedOptionKey = (typeof WIDGET_EMBED_OPTION_KEYS)[number];

export type WidgetEmbedOptions = {
  apiUrl: string;
} & Partial<Record<WidgetEmbedOptionKey, string | boolean | undefined>>;

export interface WidgetIframeRenderOptions {
  url: string;
  title?: string;
}

export interface WidgetSnippetRenderOptions extends WidgetIframeRenderOptions {
  expectedOrigin: string;
  position?: "bottom-right" | "bottom-left" | string;
}

export function buildWidgetEmbedUrl(
  workspaceId: string,
  options: WidgetEmbedOptions,
): string {
  const params = new URLSearchParams();
  params.set("workspaceId", workspaceId);

  for (const key of WIDGET_EMBED_OPTION_KEYS) {
    const value = options[key];
    if (typeof value === "string" && value.length > 0) {
      params.set(key, value);
    }
    if (key === "initialOpen" && value === true) {
      params.set(key, "true");
    }
  }

  return `${normalizeApiUrl(options.apiUrl)}/widget/embed?${params.toString()}`;
}

export function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, "");
}

export function renderWidgetIframe(options: WidgetIframeRenderOptions): string {
  return renderIframeElement({
    src: options.url,
    title: options.title,
    width: "400",
    height: "600",
    style: "border:none;border-radius:12px",
  });
}

export function renderWidgetSnippet(
  options: WidgetSnippetRenderOptions,
): string {
  const side = options.position === "bottom-left" ? "left" : "right";
  const iframe = renderIframeElement({
    id: "agent-toolkit-chat",
    src: options.url,
    title: options.title,
    style: `border:none;position:fixed;bottom:0;${side}:0;width:100%;height:100%;z-index:99999;background:transparent`,
    allowTransparency: true,
  });

  return `<!-- Agent Toolkit Chat Widget -->
${iframe}
<script>
window.addEventListener('message',function(e){
  if(e.origin!=='${escapeJs(options.expectedOrigin)}')return;
  if(e.data&&e.data.source==='agent-toolkit-widget'&&e.data.size){
    var f=document.getElementById('agent-toolkit-chat');
    if(f){f.style.width=e.data.size.width+'px';f.style.height=e.data.size.height+'px'}
  }
});
</script>`;
}

interface IframeElementOptions {
  src: string;
  title?: string;
  id?: string;
  width?: string;
  height?: string;
  style?: string;
  allowTransparency?: boolean;
}

function renderIframeElement(options: IframeElementOptions): string {
  const attrs = [
    options.id ? `id="${escapeHtml(options.id)}"` : null,
    `src="${escapeHtml(options.src)}"`,
    options.width ? `width="${escapeHtml(options.width)}"` : null,
    options.height ? `height="${escapeHtml(options.height)}"` : null,
    options.style ? `style="${escapeHtml(options.style)}"` : null,
    'allow="clipboard-write"',
    options.allowTransparency ? 'allowtransparency="true"' : null,
    `title="${escapeHtml(options.title ?? "Chat Widget")}"`,
  ].filter(Boolean);

  return `<iframe ${attrs.join(" ")}></iframe>`;
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
