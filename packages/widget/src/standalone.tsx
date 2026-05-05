import React from "react";
import { createRoot } from "react-dom/client";
import { AgentChatWidget } from "./components/AgentChatWidget.js";

interface WidgetConfig {
  workspaceId: string;
  theme?: Record<string, string | number>;
  botName?: string;
  botAvatarUrl?: string;
  subtitle?: string;
  placeholder?: string;
  greeting?: string;
  suggestions?: string[];
  autoScroll?: boolean;
  initialOpen?: boolean;
}

// Iframe must be large enough to show the widget + its box-shadows without clipping.
// Bubble: 60px + 20px offset each side + ~20px shadow room = 100
// Panel:  container(bottom:20) + gap(74) + panel(580+2 border) + shadow(~10 top) + margin ≈ 700
const BUBBLE_SIZE = { width: 100, height: 100 };
const PANEL_SIZE = { width: 440, height: 700 };

function parseConfigFromUrl(): WidgetConfig {
  const params = new URLSearchParams(window.location.search);
  const config: WidgetConfig = {
    workspaceId: params.get("workspaceId") ?? "",
  };

  if (params.get("botName")) config.botName = params.get("botName")!;
  else if (params.get("title")) config.botName = params.get("title")!;
  if (params.get("botAvatarUrl"))
    config.botAvatarUrl = params.get("botAvatarUrl")!;
  if (params.get("subtitle")) config.subtitle = params.get("subtitle")!;
  if (params.get("placeholder"))
    config.placeholder = params.get("placeholder")!;
  if (params.get("greeting"))
    config.greeting = params.get("greeting")!.replace(/\\n/g, "\n");
  if (params.get("suggestions"))
    config.suggestions = params
      .get("suggestions")!
      .split(",")
      .map((s) => s.trim());
  if (params.get("autoScroll") === "false") config.autoScroll = false;
  if (params.get("initialOpen") === "true") config.initialOpen = true;

  const theme: Record<string, string | number> = {};
  for (const key of [
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
  ]) {
    const val = params.get(key);
    if (val) theme[key] = val;
  }
  const br = params.get("borderRadius");
  if (br) theme.borderRadius = Number(br);
  if (Object.keys(theme).length > 0) config.theme = theme;

  return config;
}

function getParentOrigin(): string {
  const params = new URLSearchParams(window.location.search);
  const explicit = params.get("parentOrigin");
  if (explicit) return explicit;
  if (document.referrer) {
    try {
      return new URL(document.referrer).origin;
    } catch {
      /* fall through */
    }
  }
  return "*";
}

const resolvedParentOrigin = getParentOrigin();

function notifyParent(type: string, data?: Record<string, unknown>) {
  if (window.parent !== window) {
    window.parent.postMessage(
      { source: "agent-toolkit-widget", type, ...data },
      resolvedParentOrigin,
    );
  }
}

function setupResizeObserver() {
  const rootEl = document.getElementById("root");
  if (!rootEl) return;

  const observer = new ResizeObserver(() => {
    const width = Math.ceil(rootEl.scrollWidth);
    const height = Math.ceil(rootEl.scrollHeight);
    notifyParent("resize", { width, height });
  });

  observer.observe(rootEl);
}

function mount() {
  const config = parseConfigFromUrl();
  if (!config.workspaceId) return;

  const { botAvatarUrl, ...widgetConfig } = config;
  const botAvatar = botAvatarUrl
    ? React.createElement("img", {
        src: botAvatarUrl,
        alt: "Bot",
        style: { width: "100%", height: "100%", borderRadius: "50%" },
      })
    : undefined;

  const root = createRoot(document.getElementById("root")!);
  root.render(
    React.createElement(AgentChatWidget, {
      ...widgetConfig,
      botAvatar,
      onToggle: (isOpen: boolean) => {
        notifyParent("toggle", {
          isOpen,
          size: isOpen ? PANEL_SIZE : BUBBLE_SIZE,
        });
      },
    }),
  );

  setupResizeObserver();

  notifyParent("ready", {
    size: config.initialOpen ? PANEL_SIZE : BUBBLE_SIZE,
  });
}

mount();
