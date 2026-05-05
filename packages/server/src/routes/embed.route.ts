import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createRequire } from "node:module";

interface EmbedQuery {
  workspaceId: string;
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  borderRadius?: string;
  position?: string;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  greeting?: string;
  suggestions?: string;
  initialOpen?: string;
  parentOrigin?: string;
}

const querySchema = {
  type: "object",
  required: ["workspaceId"],
  properties: {
    workspaceId: { type: "string", minLength: 1, maxLength: 100 },
    primaryColor: { type: "string", pattern: "^#[0-9a-fA-F]{3,8}$" },
    backgroundColor: { type: "string", pattern: "^#[0-9a-fA-F]{3,8}$" },
    textColor: { type: "string", pattern: "^#[0-9a-fA-F]{3,8}$" },
    fontFamily: {
      type: "string",
      maxLength: 100,
      pattern: "^[a-zA-Z0-9\\s,\\-\"']+$",
    },
    borderRadius: { type: "string", pattern: "^\\d{1,3}$" },
    position: { type: "string", enum: ["bottom-right", "bottom-left"] },
    title: { type: "string", maxLength: 200 },
    subtitle: { type: "string", maxLength: 200 },
    placeholder: { type: "string", maxLength: 200 },
    greeting: { type: "string", maxLength: 500 },
    suggestions: { type: "string", maxLength: 1000 },
    initialOpen: { type: "string", enum: ["true", "false"] },
    parentOrigin: { type: "string", maxLength: 200 },
  },
} as const;

let standaloneBundle: string | null = null;
let bundleEtag: string | null = null;

async function loadStandaloneBundle(): Promise<string> {
  if (standaloneBundle) return standaloneBundle;

  const require = createRequire(import.meta.url);
  const widgetEntry = require.resolve("@agent-toolkit/widget");
  const distDir = dirname(widgetEntry);
  standaloneBundle = await readFile(`${distDir}/standalone.global.js`, "utf-8");
  bundleEtag = `"${createHash("sha256").update(standaloneBundle).digest("hex").slice(0, 16)}"`;
  return standaloneBundle;
}

export async function embedRoute(app: FastifyInstance) {
  app.addHook("onSend", async (request, reply) => {
    if (!request.url.startsWith("/widget/")) return;
    reply.header("Content-Security-Policy", "frame-ancestors *");
    reply.header("X-Frame-Options", "ALLOWALL");
  });

  app.get(
    "/widget/widget.js",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const bundle = await loadStandaloneBundle();

      const ifNoneMatch = request.headers["if-none-match"];
      if (ifNoneMatch && ifNoneMatch === bundleEtag) {
        return reply.status(304).send();
      }

      return reply
        .status(200)
        .header("Content-Type", "application/javascript; charset=utf-8")
        .header("Cache-Control", "public, max-age=3600, must-revalidate")
        .header("ETag", bundleEtag!)
        .send(bundle);
    },
  );

  app.get<{ Querystring: EmbedQuery }>(
    "/widget/embed",
    { schema: { querystring: querySchema } },
    async (
      request: FastifyRequest<{ Querystring: EmbedQuery }>,
      reply: FastifyReply,
    ) => {
      const q = request.query;
      const origin = `${request.protocol}://${request.host}`;

      const params = new URLSearchParams();
      params.set("workspaceId", q.workspaceId);
      for (const key of [
        "primaryColor",
        "backgroundColor",
        "textColor",
        "fontFamily",
        "borderRadius",
        "position",
        "title",
        "subtitle",
        "placeholder",
        "greeting",
        "suggestions",
        "initialOpen",
        "parentOrigin",
      ] as const) {
        if (q[key]) params.set(key, q[key]!);
      }

      const html = renderEmbedPage(origin, params.toString());

      return reply
        .status(200)
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Cache-Control", "no-cache")
        .send(html);
    },
  );
}

function renderEmbedPage(origin: string, queryString: string): string {
  return `<!DOCTYPE html>
<html lang="en" style="color-scheme:light">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Chat Widget</title>
<style>
html,body,#root{margin:0;padding:0;width:100%;height:100%;overflow:visible;background:transparent}
</style>
</head>
<body>
<div id="root"></div>
<script src="${escapeAttr(origin)}/widget/widget.js?${escapeAttr(queryString)}"></script>
</body>
</html>`;
}

function escapeAttr(val: string): string {
  return val
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
