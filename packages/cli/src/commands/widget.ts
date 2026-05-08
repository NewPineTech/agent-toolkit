import {
  buildWidgetEmbedUrl,
  normalizeApiUrl,
  renderWidgetIframe,
  renderWidgetSnippet,
} from "@agent-toolkit/core/widget";
import type { CliContext } from "../context.js";
import { writeLine } from "../context.js";
import { buildOriginHeaders } from "./shared.js";

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

export function runWidgetIframe(
  context: CliContext,
  workspaceId: string,
  options: WidgetOptions,
) {
  writeLine(
    context,
    renderWidgetIframe({
      url: buildWidgetEmbedUrl(workspaceId, options),
      title: options.title,
    }),
  );
}

export function runWidgetScript(
  context: CliContext,
  workspaceId: string,
  options: WidgetOptions,
) {
  const attrs = [
    `src="${escapeHtml(normalizeApiUrl(options.apiUrl))}/widget/widget.js"`,
    `data-workspace-id="${escapeHtml(workspaceId)}"`,
    options.title ? `data-title="${escapeHtml(options.title)}"` : null,
    options.subtitle ? `data-subtitle="${escapeHtml(options.subtitle)}"` : null,
    options.placeholder
      ? `data-placeholder="${escapeHtml(options.placeholder)}"`
      : null,
    options.greeting ? `data-greeting="${escapeHtml(options.greeting)}"` : null,
    options.suggestions
      ? `data-suggestions="${escapeHtml(options.suggestions)}"`
      : null,
    options.primaryColor
      ? `data-primary-color="${escapeHtml(options.primaryColor)}"`
      : null,
    options.backgroundColor
      ? `data-background-color="${escapeHtml(options.backgroundColor)}"`
      : null,
    options.textColor
      ? `data-text-color="${escapeHtml(options.textColor)}"`
      : null,
    options.position ? `data-position="${escapeHtml(options.position)}"` : null,
    options.initialOpen ? `data-initial-open="true"` : null,
  ].filter(Boolean);
  writeLine(context, `<script ${attrs.join(" ")}></script>`);
}

export function runWidgetSnippet(
  context: CliContext,
  workspaceId: string,
  options: WidgetOptions,
) {
  const url = buildWidgetEmbedUrl(workspaceId, options);
  const origin = new URL(url).origin;
  writeLine(
    context,
    renderWidgetSnippet({
      url,
      title: options.title,
      expectedOrigin: origin,
      position: options.position,
    }),
  );
}

export function runWidgetPreview(
  context: CliContext,
  workspaceId: string,
  options: WidgetOptions,
) {
  writeLine(context, buildWidgetEmbedUrl(workspaceId, options));
}

export async function runWidgetTest(
  context: CliContext,
  workspaceId: string,
  options: WidgetOptions,
) {
  const response = await fetch(buildWidgetEmbedUrl(workspaceId, options), {
    headers: buildOriginHeaders(options.origin),
  });
  writeLine(context, `Widget embed: HTTP ${response.status}`);
  if (!response.ok) process.exitCode = 1;
}

export const buildEmbedUrl = buildWidgetEmbedUrl;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
