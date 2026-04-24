import { getApiUrl } from './config.js';

export interface EmbedConfig {
  workspaceId: string;
  apiUrl?: string;
  theme?: {
    primaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
    fontFamily?: string;
    borderRadius?: number;
    position?: 'bottom-right' | 'bottom-left';
  };
  title?: string;
  subtitle?: string;
  placeholder?: string;
  greeting?: string;
  suggestions?: string[];
  width?: string;
  height?: string;
  initialOpen?: boolean;
}

const BUBBLE_SIZE = { width: 80, height: 80 };
const PANEL_SIZE = { width: 440, height: 660 };

export function createChatIframe(config: EmbedConfig): HTMLIFrameElement {
  const url = buildEmbedUrl(config);
  const isRight = config.theme?.position !== 'bottom-left';
  const startOpen = config.initialOpen ?? false;
  const startSize = startOpen ? PANEL_SIZE : BUBBLE_SIZE;

  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.style.border = 'none';
  iframe.style.position = 'fixed';
  iframe.style.bottom = '0';
  iframe.style[isRight ? 'right' : 'left'] = '0';
  iframe.style.width = `${startSize.width}px`;
  iframe.style.height = `${startSize.height}px`;
  iframe.style.zIndex = '99999';
  iframe.style.background = 'transparent';
  iframe.style.colorScheme = 'normal';
  iframe.style.transition = 'width 0.25s ease, height 0.25s ease';
  iframe.allow = 'clipboard-write';
  iframe.title = config.title ?? 'Chat Widget';
  iframe.setAttribute('allowtransparency', 'true');

  const expectedOrigin = new URL(url).origin;

  const handler = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow) return;
    if (event.origin !== expectedOrigin) return;
    const data = event.data;
    if (data?.source !== 'agent-toolkit-widget') return;

    if ((data.type === 'toggle' || data.type === 'ready') && data.size) {
      const w = Math.min(Math.max(Number(data.size.width) || 0, 0), PANEL_SIZE.width);
      const h = Math.min(Math.max(Number(data.size.height) || 0, 0), PANEL_SIZE.height);
      iframe.style.width = `${w}px`;
      iframe.style.height = `${h}px`;
    }
  };

  window.addEventListener('message', handler);

  const origRemove = iframe.remove.bind(iframe);
  iframe.remove = () => {
    window.removeEventListener('message', handler);
    origRemove();
  };

  return iframe;
}

export function buildEmbedUrl(config: EmbedConfig): string {
  const params = new URLSearchParams();
  params.set('workspaceId', config.workspaceId);

  if (config.apiUrl) params.set('apiUrl', config.apiUrl);
  if (config.title) params.set('title', config.title);
  if (config.subtitle) params.set('subtitle', config.subtitle);
  if (config.placeholder) params.set('placeholder', config.placeholder);
  if (config.greeting) params.set('greeting', config.greeting);
  if (config.suggestions) params.set('suggestions', config.suggestions.join(','));
  if (config.initialOpen) params.set('initialOpen', 'true');

  if (config.theme) {
    if (config.theme.primaryColor) params.set('primaryColor', config.theme.primaryColor);
    if (config.theme.backgroundColor) params.set('backgroundColor', config.theme.backgroundColor);
    if (config.theme.textColor) params.set('textColor', config.theme.textColor);
    if (config.theme.fontFamily) params.set('fontFamily', config.theme.fontFamily);
    if (config.theme.borderRadius != null) params.set('borderRadius', String(config.theme.borderRadius));
    if (config.theme.position) params.set('position', config.theme.position);
  }

  const base = (config.apiUrl ?? getApiUrl()).replace(/\/$/, '');
  return `${base}/widget/embed?${params.toString()}`;
}

export function getEmbedSnippet(config: EmbedConfig): string {
  const url = buildEmbedUrl(config);
  const title = config.title ?? 'Chat Widget';
  const isRight = config.theme?.position !== 'bottom-left';

  return `<!-- Agent Toolkit Chat Widget -->
<iframe
  id="agent-toolkit-chat"
  src="${url}"
  style="border:none;position:fixed;bottom:0;${isRight ? 'right' : 'left'}:0;width:80px;height:80px;z-index:99999;background:transparent;transition:width 0.25s ease,height 0.25s ease"
  allow="clipboard-write"
  allowtransparency="true"
  title="${title}"
></iframe>
<script>
window.addEventListener('message',function(e){
  if(e.data&&e.data.source==='agent-toolkit-widget'&&e.data.size){
    var f=document.getElementById('agent-toolkit-chat');
    if(f){f.style.width=e.data.size.width+'px';f.style.height=e.data.size.height+'px'}
  }
});
</script>`;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const script = document.currentScript as HTMLScriptElement | null;
  if (script?.dataset.workspaceId) {
    const config: EmbedConfig = {
      workspaceId: script.dataset.workspaceId,
      apiUrl: script.dataset.apiUrl || undefined,
      title: script.dataset.title,
      subtitle: script.dataset.subtitle,
      placeholder: script.dataset.placeholder,
      greeting: script.dataset.greeting,
      suggestions: script.dataset.suggestions?.split(',').map(s => s.trim()),
      initialOpen: script.dataset.initialOpen === 'true',
      theme: {
        primaryColor: script.dataset.primaryColor,
        backgroundColor: script.dataset.backgroundColor,
        textColor: script.dataset.textColor,
        position: script.dataset.position as 'bottom-right' | 'bottom-left' | undefined,
      },
    };

    const iframe = createChatIframe(config);
    document.body.appendChild(iframe);
  }
}
