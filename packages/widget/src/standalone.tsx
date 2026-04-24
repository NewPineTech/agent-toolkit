import React from 'react';
import { createRoot } from 'react-dom/client';
import { AgentChatWidget } from './components/AgentChatWidget.js';
import { configureWidget } from './config.js';

interface WidgetConfig {
  workspaceId: string;
  theme?: Record<string, string | number>;
  botName?: string;
  subtitle?: string;
  placeholder?: string;
  greeting?: string;
  suggestions?: string[];
  initialOpen?: boolean;
}

const BUBBLE_SIZE = { width: 80, height: 80 };
const PANEL_SIZE = { width: 440, height: 660 };

function parseConfigFromUrl(): WidgetConfig {
  const params = new URLSearchParams(window.location.search);
  const config: WidgetConfig = {
    workspaceId: params.get('workspaceId') ?? '',
  };

  const apiUrl = params.get('apiUrl') ?? window.location.origin;
  configureWidget({ apiUrl });
  if (params.get('title')) config.botName = params.get('title')!;
  if (params.get('subtitle')) config.subtitle = params.get('subtitle')!;
  if (params.get('placeholder')) config.placeholder = params.get('placeholder')!;
  if (params.get('greeting')) config.greeting = params.get('greeting')!;
  if (params.get('suggestions')) config.suggestions = params.get('suggestions')!.split(',').map(s => s.trim());
  if (params.get('initialOpen') === 'true') config.initialOpen = true;

  const theme: Record<string, string | number> = {};
  for (const key of ['primaryColor', 'backgroundColor', 'textColor', 'fontFamily', 'position']) {
    const val = params.get(key);
    if (val) theme[key] = val;
  }
  const br = params.get('borderRadius');
  if (br) theme.borderRadius = Number(br);
  if (Object.keys(theme).length > 0) config.theme = theme;

  return config;
}

function notifyParent(type: string, data?: Record<string, unknown>) {
  if (window.parent !== window) {
    window.parent.postMessage({ source: 'agent-toolkit-widget', type, ...data }, '*');
  }
}

function mount() {
  const config = parseConfigFromUrl();
  if (!config.workspaceId) return;

  const root = createRoot(document.getElementById('root')!);
  root.render(
    React.createElement(AgentChatWidget, {
      ...config,
      onToggle: (isOpen: boolean) => {
        notifyParent('toggle', {
          isOpen,
          size: isOpen ? PANEL_SIZE : BUBBLE_SIZE,
        });
      },
    }),
  );

  notifyParent('ready', { size: config.initialOpen ? PANEL_SIZE : BUBBLE_SIZE });
}

mount();
