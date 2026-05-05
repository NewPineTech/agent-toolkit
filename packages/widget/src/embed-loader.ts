import { getApiUrl } from "./config.js";

export interface EmbedConfig {
  workspaceId: string;
  theme?: {
    primaryColor?: string;
    primaryDeepColor?: string;
    primarySoftColor?: string;
    backgroundColor?: string;
    surfaceColor?: string;
    textColor?: string;
    textSoftColor?: string;
    textMuteColor?: string;
    borderColor?: string;
    borderSoftColor?: string;
    fontFamily?: string;
    displayFontFamily?: string;
    borderRadius?: number;
    position?: "bottom-right" | "bottom-left";
  };
  title?: string;
  subtitle?: string;
  placeholder?: string;
  greeting?: string;
  suggestions?: string[];
  botName?: string;
  botAvatarUrl?: string;
  autoScroll?: boolean;
  width?: string;
  height?: string;
  initialOpen?: boolean;
  parentOrigin?: string;
}

// Must match standalone.tsx sizes exactly
const BUBBLE_SIZE = { width: 100, height: 100 };
const PANEL_SIZE = { width: 440, height: 700 };

export function createChatIframe(config: EmbedConfig): HTMLIFrameElement {
  const url = buildEmbedUrl(config);
  const isRight = config.theme?.position !== "bottom-left";
  const startOpen = config.initialOpen ?? false;
  const startSize = startOpen ? PANEL_SIZE : BUBBLE_SIZE;

  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.style.border = "none";
  iframe.style.position = "fixed";
  iframe.style.bottom = "0";
  iframe.style[isRight ? "right" : "left"] = "0";
  iframe.style.width = `${startSize.width}px`;
  iframe.style.height = `${startSize.height}px`;
  iframe.style.zIndex = "99999";
  iframe.style.background = "transparent";
  iframe.style.colorScheme = "normal";
  iframe.style.transition = "none";
  iframe.allow = "clipboard-write";
  iframe.title = config.title ?? "Chat Widget";
  iframe.setAttribute("allowtransparency", "true");

  const expectedOrigin = new URL(url).origin;

  const handler = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow) return;
    if (event.origin !== expectedOrigin) return;
    const data = event.data;
    if (data?.source !== "agent-toolkit-widget") return;

    if ((data.type === "toggle" || data.type === "ready") && data.size) {
      const w = Math.min(
        Math.max(Number(data.size.width) || 0, 0),
        PANEL_SIZE.width,
      );
      const h = Math.min(
        Math.max(Number(data.size.height) || 0, 0),
        PANEL_SIZE.height,
      );
      iframe.style.width = `${w}px`;
      iframe.style.height = `${h}px`;
    }
  };

  window.addEventListener("message", handler);

  const origRemove = iframe.remove.bind(iframe);
  iframe.remove = () => {
    window.removeEventListener("message", handler);
    origRemove();
  };

  return iframe;
}

export function buildEmbedUrl(config: EmbedConfig): string {
  const params = new URLSearchParams();
  params.set("workspaceId", config.workspaceId);

  if (config.title) params.set("title", config.title);
  if (config.subtitle) params.set("subtitle", config.subtitle);
  if (config.placeholder) params.set("placeholder", config.placeholder);
  if (config.greeting) params.set("greeting", config.greeting);
  if (config.suggestions)
    params.set("suggestions", config.suggestions.join(","));
  if (config.botName) params.set("botName", config.botName);
  if (config.botAvatarUrl) params.set("botAvatarUrl", config.botAvatarUrl);
  if (config.autoScroll === false) params.set("autoScroll", "false");
  if (config.initialOpen) params.set("initialOpen", "true");

  if (config.theme) {
    const stringKeys = [
      "primaryColor",
      "primaryDeepColor",
      "primarySoftColor",
      "backgroundColor",
      "surfaceColor",
      "textColor",
      "textSoftColor",
      "textMuteColor",
      "borderColor",
      "borderSoftColor",
      "fontFamily",
      "displayFontFamily",
      "position",
    ] as const;
    for (const key of stringKeys) {
      const val = config.theme[key];
      if (val) params.set(key, val);
    }
    if (config.theme.borderRadius != null)
      params.set("borderRadius", String(config.theme.borderRadius));
  }

  const base = getApiUrl();
  if (config.parentOrigin) {
    params.set("parentOrigin", config.parentOrigin);
  } else if (typeof window !== "undefined") {
    params.set("parentOrigin", window.location.origin);
  }
  return `${base}/widget/embed?${params.toString()}`;
}

export function getEmbedSnippet(config: EmbedConfig): string {
  const url = buildEmbedUrl(config);
  const title = config.title ?? "Chat Widget";
  const isRight = config.theme?.position !== "bottom-left";

  const expectedOrigin = new URL(url).origin;

  return `<!-- Agent Toolkit Chat Widget -->
<iframe
  id="agent-toolkit-chat"
  src="${url}"
  style="border:none;position:fixed;bottom:0;${isRight ? "right" : "left"}:0;width:100%;height:100%;z-index:99999;background:transparent"
  allow="clipboard-write"
  allowtransparency="true"
  title="${title}"
></iframe>
<script>
window.addEventListener('message',function(e){
  if(e.origin!=='${expectedOrigin}')return;
  if(e.data&&e.data.source==='agent-toolkit-widget'&&e.data.size){
    var f=document.getElementById('agent-toolkit-chat');
    if(f){f.style.width=e.data.size.width+'px';f.style.height=e.data.size.height+'px'}
  }
});
</script>`;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const script = document.currentScript as HTMLScriptElement | null;
  if (script?.dataset.workspaceId) {
    const config: EmbedConfig = {
      workspaceId: script.dataset.workspaceId,
      parentOrigin: script.dataset.parentOrigin,
      title: script.dataset.title,
      subtitle: script.dataset.subtitle,
      placeholder: script.dataset.placeholder,
      greeting: script.dataset.greeting,
      suggestions: script.dataset.suggestions?.split(",").map((s) => s.trim()),
      botName: script.dataset.botName,
      botAvatarUrl: script.dataset.botAvatarUrl,
      autoScroll: script.dataset.autoScroll === "false" ? false : undefined,
      initialOpen: script.dataset.initialOpen === "true",
      theme: {
        primaryColor: script.dataset.primaryColor,
        primaryDeepColor: script.dataset.primaryDeepColor,
        primarySoftColor: script.dataset.primarySoftColor,
        backgroundColor: script.dataset.backgroundColor,
        surfaceColor: script.dataset.surfaceColor,
        textColor: script.dataset.textColor,
        textSoftColor: script.dataset.textSoftColor,
        textMuteColor: script.dataset.textMuteColor,
        borderColor: script.dataset.borderColor,
        borderSoftColor: script.dataset.borderSoftColor,
        fontFamily: script.dataset.fontFamily,
        displayFontFamily: script.dataset.displayFontFamily,
        position: script.dataset.position as
          | "bottom-right"
          | "bottom-left"
          | undefined,
      },
    };

    const iframe = createChatIframe(config);
    document.body.appendChild(iframe);
  }
}
