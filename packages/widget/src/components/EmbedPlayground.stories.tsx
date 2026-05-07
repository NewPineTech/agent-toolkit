import { useState, useEffect, useRef, useCallback } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  createChatIframe,
  getEmbedSnippet,
  type EmbedConfig,
} from "../embed-loader.js";

interface PlaygroundProps {
  workspaceId: string;
  parentOrigin: string;
  title: string;
  subtitle: string;
  placeholder: string;
  greeting: string;
  suggestions: string;
  botName: string;
  botAvatarUrl: string;
  autoScroll: boolean;
  initialOpen: boolean;
  width: string;
  height: string;
  primaryColor: string;
  primaryDeepColor: string;
  primarySoftColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  textSoftColor: string;
  textMuteColor: string;
  borderColor: string;
  borderSoftColor: string;
  fontFamily: string;
  displayFontFamily: string;
  borderRadius: number;
  position: "bottom-right" | "bottom-left";
}

function buildConfig(props: PlaygroundProps): EmbedConfig {
  return {
    workspaceId: props.workspaceId,
    parentOrigin: props.parentOrigin || undefined,
    title: props.title || undefined,
    subtitle: props.subtitle || undefined,
    placeholder: props.placeholder || undefined,
    greeting: props.greeting || undefined,
    suggestions: props.suggestions
      ? props.suggestions.split(",").map((s) => s.trim())
      : undefined,
    botName: props.botName || undefined,
    botAvatarUrl: props.botAvatarUrl || undefined,
    autoScroll: props.autoScroll,
    initialOpen: props.initialOpen,
    width: props.width || undefined,
    height: props.height || undefined,
    theme: {
      primaryColor: props.primaryColor || undefined,
      primaryDeepColor: props.primaryDeepColor || undefined,
      primarySoftColor: props.primarySoftColor || undefined,
      backgroundColor: props.backgroundColor || undefined,
      surfaceColor: props.surfaceColor || undefined,
      textColor: props.textColor || undefined,
      textSoftColor: props.textSoftColor || undefined,
      textMuteColor: props.textMuteColor || undefined,
      borderColor: props.borderColor || undefined,
      borderSoftColor: props.borderSoftColor || undefined,
      fontFamily: props.fontFamily || undefined,
      displayFontFamily: props.displayFontFamily || undefined,
      borderRadius: props.borderRadius,
      position: props.position,
    },
  };
}

function EmbedPlayground(props: PlaygroundProps) {
  const [snippet, setSnippet] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "snippet">("preview");
  const previewRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const config = buildConfig(props);

  useEffect(() => {
    setSnippet(getEmbedSnippet(config));
  }, [
    props.workspaceId,
    props.parentOrigin,
    props.title,
    props.subtitle,
    props.placeholder,
    props.greeting,
    props.suggestions,
    props.botName,
    props.botAvatarUrl,
    props.autoScroll,
    props.initialOpen,
    props.width,
    props.height,
    props.primaryColor,
    props.primaryDeepColor,
    props.primarySoftColor,
    props.backgroundColor,
    props.surfaceColor,
    props.textColor,
    props.textSoftColor,
    props.textMuteColor,
    props.borderColor,
    props.borderSoftColor,
    props.fontFamily,
    props.displayFontFamily,
    props.borderRadius,
    props.position,
  ]);

  const handleCreateIframe = useCallback(() => {
    if (!previewRef.current) return;

    if (iframeRef.current) {
      iframeRef.current.remove();
      iframeRef.current = null;
    }

    const iframe = createChatIframe(config);
    iframe.style.position = "absolute";
    iframe.style.bottom = "20px";
    iframe.style[config.theme?.position !== "bottom-left" ? "right" : "left"] =
      "20px";

    previewRef.current.appendChild(iframe);
    iframeRef.current = iframe;
  }, [
    props.workspaceId,
    props.parentOrigin,
    props.title,
    props.subtitle,
    props.placeholder,
    props.greeting,
    props.suggestions,
    props.botName,
    props.botAvatarUrl,
    props.autoScroll,
    props.initialOpen,
    props.width,
    props.height,
    props.primaryColor,
    props.primaryDeepColor,
    props.primarySoftColor,
    props.backgroundColor,
    props.surfaceColor,
    props.textColor,
    props.textSoftColor,
    props.textMuteColor,
    props.borderColor,
    props.borderSoftColor,
    props.fontFamily,
    props.displayFontFamily,
    props.borderRadius,
    props.position,
  ]);

  useEffect(() => {
    return () => {
      if (iframeRef.current) {
        iframeRef.current.remove();
        iframeRef.current = null;
      }
    };
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: "0",
          borderBottom: "1px solid #e5e7eb",
          background: "#f9fafb",
          padding: "0 16px",
        }}
      >
        <button
          onClick={() => setActiveTab("preview")}
          style={{
            padding: "12px 20px",
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: activeTab === "preview" ? 600 : 400,
            color: activeTab === "preview" ? "#111827" : "#6b7280",
            borderBottom:
              activeTab === "preview"
                ? "2px solid #6366f1"
                : "2px solid transparent",
            marginBottom: "-1px",
          }}
        >
          Live Preview (createChatIframe)
        </button>
        <button
          onClick={() => setActiveTab("snippet")}
          style={{
            padding: "12px 20px",
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: activeTab === "snippet" ? 600 : 400,
            color: activeTab === "snippet" ? "#111827" : "#6b7280",
            borderBottom:
              activeTab === "snippet"
                ? "2px solid #6366f1"
                : "2px solid transparent",
            marginBottom: "-1px",
          }}
        >
          Embed Snippet (getEmbedSnippet)
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {activeTab === "preview" && (
          <div
            style={{ height: "100%", display: "flex", flexDirection: "column" }}
          >
            <div
              style={{
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                background: "#fff",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <button
                onClick={handleCreateIframe}
                style={{
                  padding: "8px 20px",
                  background: "#6366f1",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                Create Iframe
              </button>
              <button
                onClick={() => {
                  if (iframeRef.current) {
                    iframeRef.current.remove();
                    iframeRef.current = null;
                  }
                }}
                style={{
                  padding: "8px 20px",
                  background: "#fff",
                  color: "#6b7280",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                }}
              >
                Remove
              </button>
              <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                Adjust controls in the Storybook panel below, then click "Create
                Iframe"
              </span>
            </div>
            <div
              ref={previewRef}
              style={{
                flex: 1,
                position: "relative",
                background:
                  "repeating-conic-gradient(#f3f4f6 0% 25%, #fff 0% 50%) 0 0 / 20px 20px",
              }}
            />
          </div>
        )}

        {activeTab === "snippet" && (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              background: "#fff",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <button
                onClick={handleCopy}
                style={{
                  padding: "8px 20px",
                  background: copied ? "#059669" : "#6366f1",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                  transition: "background 0.2s",
                  minWidth: "120px",
                }}
              >
                {copied ? "Copied!" : "Copy Snippet"}
              </button>
              <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                HTML embed code generated from your current settings
              </span>
            </div>
            <pre
              style={{
                flex: 1,
                margin: 0,
                padding: "16px",
                overflow: "auto",
                fontSize: "13px",
                lineHeight: "1.6",
                background: "#1e1e2e",
                color: "#cdd6f4",
                fontFamily:
                  '"JetBrains Mono", "SF Mono", "Fira Code", Menlo, monospace',
              }}
            >
              <code>{snippet}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

const meta = {
  title: "Embed/Playground",
  component: EmbedPlayground,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    workspaceId: {
      control: "text",
      description: "Workspace identifier (required)",
      table: { category: "Core" },
    },
    parentOrigin: {
      control: "text",
      description:
        "Origin allowed to receive postMessage events from the widget (defaults to current window origin)",
      table: { category: "Core" },
    },
    title: {
      control: "text",
      description: "Widget header title (legacy, prefer botName)",
      table: { category: "Content" },
    },
    subtitle: {
      control: "text",
      description: "Header subtitle text",
      table: { category: "Content" },
    },
    placeholder: {
      control: "text",
      description: "Input placeholder text",
      table: { category: "Content" },
    },
    greeting: {
      control: "text",
      description: "Welcome greeting (supports \\n)",
      table: { category: "Content" },
    },
    suggestions: {
      control: "text",
      description: "Comma-separated suggestion strings",
      table: { category: "Content" },
    },
    botName: {
      control: "text",
      description: "Bot display name shown in header",
      table: { category: "Content" },
    },
    botAvatarUrl: {
      control: "text",
      description:
        "URL for the bot avatar image (displayed in header, bubble, and messages)",
      table: { category: "Content" },
    },
    autoScroll: {
      control: "boolean",
      description: "Auto-scroll to bottom while assistant types",
      table: { category: "Behavior" },
    },
    initialOpen: {
      control: "boolean",
      description: "Start with panel open",
      table: { category: "Behavior" },
    },
    width: {
      control: "text",
      description: 'Iframe width (e.g. "400px")',
      table: { category: "Layout" },
    },
    height: {
      control: "text",
      description: 'Iframe height (e.g. "600px")',
      table: { category: "Layout" },
    },
    position: {
      control: "inline-radio",
      options: ["bottom-right", "bottom-left"],
      description: "Widget position",
      table: { category: "Layout" },
    },
    primaryColor: {
      control: "color",
      description: "Main accent color (buttons, links)",
      table: { category: "Theme – Colors" },
    },
    primaryDeepColor: {
      control: "color",
      description: "Darker primary variant (active states)",
      table: { category: "Theme – Colors" },
    },
    primarySoftColor: {
      control: "color",
      description: "Lighter primary variant (highlights, badges)",
      table: { category: "Theme – Colors" },
    },
    backgroundColor: {
      control: "color",
      description: "Overall background color",
      table: { category: "Theme – Colors" },
    },
    surfaceColor: {
      control: "color",
      description: "Card / panel surface color",
      table: { category: "Theme – Colors" },
    },
    textColor: {
      control: "color",
      description: "Primary text color",
      table: { category: "Theme – Colors" },
    },
    textSoftColor: {
      control: "color",
      description: "Secondary / muted text color",
      table: { category: "Theme – Colors" },
    },
    textMuteColor: {
      control: "color",
      description: "Placeholder / disabled text color",
      table: { category: "Theme – Colors" },
    },
    borderColor: {
      control: "color",
      description: "Primary border color",
      table: { category: "Theme – Colors" },
    },
    borderSoftColor: {
      control: "color",
      description: "Subtle border / divider color",
      table: { category: "Theme – Colors" },
    },
    fontFamily: {
      control: "text",
      description: "Body font family",
      table: { category: "Theme – Typography" },
    },
    displayFontFamily: {
      control: "text",
      description: "Display / heading font family",
      table: { category: "Theme – Typography" },
    },
    borderRadius: {
      control: { type: "range", min: 0, max: 24, step: 1 },
      description: "Border radius (px)",
      table: { category: "Theme – Shape" },
    },
  },
} satisfies Meta<typeof EmbedPlayground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    workspaceId: "ws_dev_001",
    parentOrigin: "http://localhost:8000",
    title: "",
    subtitle: "",
    placeholder: "",
    greeting: "",
    suggestions:
      "Bạn có thể giúp được gì?,\nQuy trình tuyển dụng gồm các bước nào?,\nQuy định công tác phí?",
    botName: "Trợ Lý Ảo - New PineTech",
    botAvatarUrl: "https://ai-hr.pinetech.vn/logo-128.png",
    autoScroll: true,
    initialOpen: true,
    width: "",
    height: "",
    primaryColor: "#059669",
    primaryDeepColor: "#064e3b",
    primarySoftColor: "#ecfdf5",
    backgroundColor: "#f0fdf4",
    surfaceColor: "#ffffff",
    textColor: "#064e3b",
    textSoftColor: "#6b7f6b",
    textMuteColor: "#9ca89c",
    borderColor: "#d1e7d5",
    borderSoftColor: "#e6f4ea",
    fontFamily: "",
    displayFontFamily: "",
    borderRadius: 12,
    position: "bottom-right",
  },
};

export const GreenTheme: Story = {
  args: {
    workspaceId: "ws_dev_001",
    parentOrigin: "",
    title: "HR Assistant",
    subtitle: "Online now",
    placeholder: "Ask about company policies...",
    greeting: "Welcome!\\nHow can I help you today?",
    suggestions: "Leave policy,Onboarding process,Benefits overview",
    botName: "HR Bot",
    botAvatarUrl: "https://ai-hr.pinetech.vn/logo-128.png",
    autoScroll: true,
    initialOpen: true,
    width: "",
    height: "",
    primaryColor: "#059669",
    primaryDeepColor: "#047857",
    primarySoftColor: "#d1fae5",
    backgroundColor: "#f0fdf4",
    surfaceColor: "#ffffff",
    textColor: "#064e3b",
    textSoftColor: "#065f46",
    textMuteColor: "#6ee7b7",
    borderColor: "#a7f3d0",
    borderSoftColor: "#d1fae5",
    fontFamily: "",
    displayFontFamily: "",
    borderRadius: 16,
    position: "bottom-right",
  },
};

export const MinimalConfig: Story = {
  args: {
    workspaceId: "ws_dev_001",
    parentOrigin: "",
    title: "",
    subtitle: "",
    placeholder: "",
    greeting: "",
    suggestions: "",
    botName: "",
    botAvatarUrl: "",
    autoScroll: true,
    initialOpen: false,
    width: "",
    height: "",
    primaryColor: "",
    primaryDeepColor: "",
    primarySoftColor: "",
    backgroundColor: "",
    surfaceColor: "",
    textColor: "",
    textSoftColor: "",
    textMuteColor: "",
    borderColor: "",
    borderSoftColor: "",
    fontFamily: "",
    displayFontFamily: "",
    borderRadius: 12,
    position: "bottom-right",
  },
};
