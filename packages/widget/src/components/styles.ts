import type { CSSProperties } from "react";

export interface ChatTheme {
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
}

const defaults: Required<ChatTheme> = {
  primaryColor: "#D4775A",
  primaryDeepColor: "#8C4A34",
  primarySoftColor: "#FFF0E8",
  backgroundColor: "#FFF8EE",
  surfaceColor: "#FFFDF8",
  textColor: "#1E1B16",
  textSoftColor: "#6E6557",
  textMuteColor: "#A89C88",
  borderColor: "#EFE6D4",
  borderSoftColor: "#F6EFDE",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  displayFontFamily: 'Georgia, "Times New Roman", serif',
  borderRadius: 20,
  position: "bottom-right",
};

export function resolveTheme(theme?: ChatTheme): Required<ChatTheme> {
  return { ...defaults, ...theme };
}

export const KEYFRAMES_CSS = `
@keyframes rcw-bounce {
  0%, 60%, 100% {
    opacity: 0.35;
    transform: translateY(0) scale(0.9);
  }
  30% {
    opacity: 1;
    transform: translateY(-2px) scale(1.1);
  }
}
@keyframes rcw-fade-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@keyframes rcw-slide-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`;

export const MARKDOWN_CSS = `
.rcw-markdown {
  line-height: 1.55;
  word-break: break-word;
}
.rcw-markdown > :first-child { margin-top: 0; }
.rcw-markdown > :last-child { margin-bottom: 0; }

.rcw-markdown p {
  margin: 0 0 8px;
}
.rcw-markdown p:last-child {
  margin-bottom: 0;
}

.rcw-markdown strong { font-weight: 600; }
.rcw-markdown em { font-style: italic; }

.rcw-markdown code {
  font-family: "JetBrains Mono", "SF Mono", "Fira Code", Menlo, Consolas, monospace;
  font-size: 0.85em;
  background: rgba(0,0,0,0.05);
  padding: 2px 6px;
  border-radius: 5px;
}

.rcw-markdown pre {
  margin: 8px 0;
  padding: 10px 12px;
  background: rgba(0,0,0,0.05);
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.8125em;
}
.rcw-markdown pre code {
  background: none;
  padding: 0;
  border-radius: 0;
}

.rcw-markdown ul, .rcw-markdown ol {
  margin: 4px 0;
  padding-left: 20px;
}
.rcw-markdown li {
  margin: 2px 0;
}
.rcw-markdown li > p {
  margin: 0;
}

.rcw-markdown blockquote {
  margin: 8px 0;
  padding: 4px 12px;
  border-left: 3px solid rgba(0,0,0,0.12);
  color: inherit;
  opacity: 0.85;
}
.rcw-markdown blockquote p {
  margin: 0;
}

.rcw-markdown a {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  word-break: break-all;
  overflow-wrap: break-word;
}
.rcw-markdown a[title] {
  word-break: normal;
  overflow-wrap: normal;
}

.rcw-markdown hr {
  border: none;
  border-top: 1px solid rgba(0,0,0,0.08);
  margin: 10px 0;
}

.rcw-markdown table {
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 0.875em;
  width: 100%;
}
.rcw-markdown th, .rcw-markdown td {
  border: 1px solid rgba(0,0,0,0.08);
  padding: 4px 8px;
  text-align: left;
}
.rcw-markdown th {
  font-weight: 600;
  background: rgba(0,0,0,0.03);
}

.rcw-markdown h1, .rcw-markdown h2, .rcw-markdown h3,
.rcw-markdown h4, .rcw-markdown h5, .rcw-markdown h6 {
  margin: 12px 0 4px;
  font-weight: 600;
  line-height: 1.3;
}
.rcw-markdown h1 { font-size: 1.25em; }
.rcw-markdown h2 { font-size: 1.125em; }
.rcw-markdown h3 { font-size: 1em; }
`;

export const INTERACTIVE_CSS = `
.rcw-bubble-btn:hover {
  transform: scale(1.05);
}
.rcw-bubble-btn:active {
  transform: scale(0.97);
}
.rcw-send-btn:hover {
  opacity: 0.9 !important;
}
.rcw-icon-btn {
  transition: background 0.15s;
}
.rcw-icon-btn:hover {
  background: rgba(0,0,0,0.05) !important;
}
.rcw-suggestion-btn {
  transition: background 0.15s, border-color 0.15s;
}
.rcw-suggestion-btn:hover {
  background: rgba(0,0,0,0.03) !important;
}
.rcw-input-field:focus {
  outline: none;
}
.rcw-input-field {
  scrollbar-width: thin;
  scrollbar-color: rgba(0,0,0,0.15) transparent;
}
.rcw-input-field::-webkit-scrollbar {
  width: 4px;
}
.rcw-input-field::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.12);
  border-radius: 2px;
}
.rcw-action-btn {
  transition: background 0.15s, color 0.15s;
}
.rcw-action-btn:hover {
  background: rgba(0,0,0,0.06) !important;
}
`;

export function createStyles(theme: Required<ChatTheme>) {
  const isRight = theme.position === "bottom-right";

  return {
    container: {
      position: "fixed",
      bottom: "20px",
      [isRight ? "right" : "left"]: "20px",
      zIndex: 9999,
      fontFamily: theme.fontFamily,
    } satisfies CSSProperties,

    bubble: {
      width: "60px",
      height: "60px",
      borderRadius: "50%",
      background: theme.primaryColor,
      color: "#ffffff",
      border: "none",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "24px",
      boxShadow: `0 12px 30px -8px ${theme.primaryColor}80, 0 4px 10px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.25)`,
      transition: "transform 0.2s cubic-bezier(0.2, 0.7, 0.3, 1)",
      willChange: "transform",
    } satisfies CSSProperties,

    panel: {
      position: "absolute",
      bottom: "74px",
      [isRight ? "right" : "left"]: "0",
      width: "400px",
      height: "580px",
      backgroundColor: theme.surfaceColor,
      borderRadius: `${theme.borderRadius}px`,
      boxShadow:
        "0 2px 6px rgba(60, 40, 20, 0.06), 0 30px 60px -20px rgba(60, 40, 20, 0.22), 0 12px 30px -10px rgba(60, 40, 20, 0.12)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      border: `1px solid ${theme.borderColor}`,
      animation: "rcw-fade-in 0.25s cubic-bezier(0.2, 0.7, 0.3, 1)",
    } satisfies CSSProperties,

    header: {
      padding: "18px 20px 16px",
      background: `linear-gradient(180deg, ${theme.primarySoftColor} 0%, ${theme.surfaceColor} 100%)`,
      display: "flex",
      alignItems: "flex-start",
      gap: "12px",
      position: "relative",
    } satisfies CSSProperties,

    headerAvatar: {
      width: "42px",
      height: "42px",
      borderRadius: "21px",
      background: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 2px 6px rgba(60, 40, 20, 0.12)",
      flexShrink: 0,
    } satisfies CSSProperties,

    headerInfo: {
      flex: 1,
      minWidth: 0,
      paddingTop: "2px",
    } satisfies CSSProperties,

    headerTitle: {
      fontSize: "15px",
      fontFamily: theme.fontFamily,
      fontWeight: 600,
      lineHeight: "1.2",
      letterSpacing: "-0.1px",
      color: theme.textColor,
    } satisfies CSSProperties,

    headerSubtitle: {
      fontSize: "12px",
      color: theme.textSoftColor,
      marginTop: "3px",
      display: "flex",
      alignItems: "center",
      gap: "5px",
    } satisfies CSSProperties,

    statusDot: {
      width: "6px",
      height: "6px",
      borderRadius: "3px",
      background: "#8DD1A0",
    } satisfies CSSProperties,

    headerActions: {
      display: "flex",
      gap: "2px",
    } satisfies CSSProperties,

    iconButton: {
      width: "30px",
      height: "30px",
      borderRadius: "15px",
      border: "none",
      background: "transparent",
      color: theme.textSoftColor,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      padding: 0,
    } satisfies CSSProperties,

    messageList: {
      flex: 1,
      overflowY: "auto",
      padding: "18px 20px",
      display: "flex",
      flexDirection: "column",
    } satisfies CSSProperties,

    messageRow: {
      display: "flex",
      marginBottom: "12px",
      gap: "8px",
      alignItems: "flex-end",
    } satisfies CSSProperties,

    avatarSmall: {
      width: "26px",
      height: "26px",
      borderRadius: "13px",
      background: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      boxShadow: "0 1px 3px rgba(60, 40, 20, 0.1)",
      marginBottom: "2px",
    } satisfies CSSProperties,

    messageWrapperUser: {
      maxWidth: "85%",
    } satisfies CSSProperties,

    messageWrapperAssistant: {
      maxWidth: "85%",
    } satisfies CSSProperties,

    messageBubbleUser: {
      background: theme.primaryColor,
      color: "#fff",
      padding: "10px 14px",
      borderRadius: "18px",
      borderBottomRightRadius: "6px",
      fontSize: "13.5px",
      lineHeight: "1.5",
      wordBreak: "break-word",
      animation: "rcw-slide-up 0.2s ease-out",
    } satisfies CSSProperties,

    messageBubbleAssistant: {
      background: "#fff",
      color: theme.textColor,
      padding: "10px 14px",
      borderRadius: "18px",
      borderBottomLeftRadius: "6px",
      fontSize: "13.5px",
      lineHeight: "1.5",
      wordBreak: "break-word",
      border: `1px solid ${theme.borderColor}`,
      boxShadow: "0 1px 2px rgba(60, 40, 20, 0.03)",
      animation: "rcw-slide-up 0.2s ease-out",
    } satisfies CSSProperties,

    inputContainer: {
      padding: "12px 14px 14px",
      background: theme.surfaceColor,
    } satisfies CSSProperties,

    inputWrapper: {
      display: "flex",
      alignItems: "flex-end",
      gap: "4px",
      border: `1.5px solid ${theme.borderColor}`,
      borderRadius: "24px",
      padding: "6px 6px 6px 16px",
      background: theme.surfaceColor,
      transition: "border-color 0.15s",
    } satisfies CSSProperties,

    textarea: {
      flex: 1,
      border: "none",
      outline: "none",
      background: "transparent",
      fontFamily: "inherit",
      fontSize: "13.5px",
      lineHeight: "1.45",
      color: theme.textColor,
      padding: "6px 0",
      resize: "none",
      maxHeight: "120px",
      overflowY: "auto",
    } satisfies CSSProperties,

    sendButton: {
      width: "32px",
      height: "32px",
      borderRadius: "16px",
      border: "none",
      background: theme.primaryColor,
      color: "#fff",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
      transition: "background 0.15s, opacity 0.15s",
    } satisfies CSSProperties,

    sendButtonInactive: {
      width: "32px",
      height: "32px",
      borderRadius: "16px",
      border: "none",
      background: `${theme.primaryColor}80`, //'#E8D5B8',
      color: "#fff",
      cursor: "default",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
    } satisfies CSSProperties,

    typingDots: {
      display: "flex",
      gap: "5px",
      padding: "14px 16px",
      alignItems: "center",
      background: "#fff",
      borderRadius: "18px",
      borderBottomLeftRadius: "6px",
      border: `1px solid ${theme.borderColor}`,
    } satisfies CSSProperties,

    dot: {
      width: "7px",
      height: "7px",
      borderRadius: "4px",
      backgroundColor: theme.primaryColor,
      display: "inline-block",
    } satisfies CSSProperties,

    welcomeTitle: {
      fontSize: "28px",
      lineHeight: "1.05",
      fontFamily: theme.displayFontFamily,
      letterSpacing: "-0.5px",
      color: theme.textColor,
      padding: "4px 0 18px",
    } satisfies CSSProperties,

    welcomeCard: {
      padding: "14px",
      borderRadius: "18px",
      background: theme.primarySoftColor,
      display: "flex",
      gap: "12px",
      alignItems: "center",
      marginBottom: "14px",
      cursor: "pointer",
    } satisfies CSSProperties,

    welcomeCardIcon: {
      width: "34px",
      height: "34px",
      borderRadius: "17px",
      background: theme.primaryColor,
      color: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    } satisfies CSSProperties,

    sectionLabel: {
      fontSize: "11px",
      fontWeight: 600,
      color: theme.textSoftColor,
      letterSpacing: "0.8px",
      textTransform: "uppercase",
      marginBottom: "10px",
    } satisfies CSSProperties,

    emptyState: {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: "20px 10px",
      gap: "16px",
    } satisfies CSSProperties,

    emptyTitle: {
      fontSize: "24px",
      fontFamily: theme.displayFontFamily,
      letterSpacing: "-0.3px",
      lineHeight: "1.1",
      color: theme.textColor,
    } satisfies CSSProperties,

    emptySubtitle: {
      fontSize: "13px",
      color: theme.textSoftColor,
      marginTop: "8px",
      maxWidth: "260px",
      lineHeight: "1.5",
    } satisfies CSSProperties,

    actionBar: {
      display: "flex",
      gap: "2px",
      paddingTop: "4px",
    } satisfies CSSProperties,

    actionButton: {
      width: "26px",
      height: "26px",
      borderRadius: "6px",
      border: "none",
      background: "transparent",
      color: theme.textMuteColor,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      padding: 0,
    } satisfies CSSProperties,

    suggestionButton: {
      textAlign: "left",
      fontSize: "13px",
      padding: "10px 14px",
      border: `1px solid ${theme.borderColor}`,
      borderRadius: "20px",
      background: theme.surfaceColor,
      color: theme.textColor,
      cursor: "pointer",
      fontFamily: "inherit",
      width: "100%",
    } satisfies CSSProperties,
  };
}
