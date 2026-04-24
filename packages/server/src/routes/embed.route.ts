import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';

interface EmbedQuery {
  workspaceId: string;
  apiUrl?: string;
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
}

const querySchema = {
  type: 'object',
  required: ['workspaceId'],
  properties: {
    workspaceId: { type: 'string', minLength: 1 },
    apiUrl: { type: 'string' },
    primaryColor: { type: 'string' },
    backgroundColor: { type: 'string' },
    textColor: { type: 'string' },
    fontFamily: { type: 'string' },
    borderRadius: { type: 'string' },
    position: { type: 'string', enum: ['bottom-right', 'bottom-left'] },
    title: { type: 'string' },
    subtitle: { type: 'string' },
    placeholder: { type: 'string' },
    greeting: { type: 'string' },
    suggestions: { type: 'string' },
    initialOpen: { type: 'string', enum: ['true', 'false'] },
  },
} as const;

let standaloneBundle: string | null = null;

async function loadStandaloneBundle(): Promise<string> {
  if (standaloneBundle) return standaloneBundle;

  const require = createRequire(import.meta.url);
  const widgetEntry = require.resolve('@agent-toolkit/widget');
  const distDir = dirname(widgetEntry);
  standaloneBundle = await readFile(`${distDir}/standalone.global.js`, 'utf-8');
  return standaloneBundle;
}

export async function embedRoute(app: FastifyInstance) {
  app.get(
    '/widget/widget.js',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const bundle = await loadStandaloneBundle();
      return reply
        .status(200)
        .header('Content-Type', 'application/javascript; charset=utf-8')
        .header('Cache-Control', 'public, max-age=86400')
        .send(bundle);
    },
  );

  app.get<{ Querystring: EmbedQuery }>(
    '/widget/embed',
    { schema: { querystring: querySchema } },
    async (request: FastifyRequest<{ Querystring: EmbedQuery }>, reply: FastifyReply) => {
      const q = request.query;
      const origin = `${request.protocol}://${request.host}`;

      const params = new URLSearchParams();
      params.set('workspaceId', q.workspaceId);
      params.set('apiUrl', q.apiUrl || origin);
      for (const key of ['primaryColor', 'backgroundColor', 'textColor', 'fontFamily', 'borderRadius', 'position', 'title', 'subtitle', 'placeholder', 'greeting', 'suggestions', 'initialOpen'] as const) {
        if (q[key]) params.set(key, q[key]!);
      }

      const html = renderEmbedPage(origin, params.toString());

      return reply
        .status(200)
        .header('Content-Type', 'text/html; charset=utf-8')
        .header('Cache-Control', 'public, max-age=3600')
        .header('Content-Security-Policy', 'frame-ancestors *')
        .send(html);
    },
  );
}

function renderEmbedPage(origin: string, queryString: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Chat Widget</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:transparent}
#root{width:100%;height:100%}
</style>
</head>
<body>
<div id="root"></div>
<script>
// Pass query params to standalone script via URL
(function(){
  if(window.location.search) return;
  var qs = ${JSON.stringify(queryString).replace(/</g, '\\u003c')};
  if(qs) history.replaceState(null,'','?'+qs);
})();
</script>
<script src="${escapeAttr(origin)}/widget/widget.js"></script>
</body>
</html>`;
}

function escapeAttr(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
