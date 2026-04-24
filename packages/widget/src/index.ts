export { configureWidget } from './config.js';

export {
  AgentChatWidget,
  type AgentChatWidgetProps,
} from './components/AgentChatWidget.js';

export {
  useAgentChat,
  type UseAgentChatOptions,
  type UseAgentChatReturn,
  type Message,
} from './hooks/useAgentChat.js';

export type { ChatTheme } from './components/styles.js';

export {
  createChatIframe,
  buildEmbedUrl,
  getEmbedSnippet,
  type EmbedConfig,
} from './embed-loader.js';
