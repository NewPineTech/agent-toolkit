import React, { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { X, ArrowRight, Sparkles, RotateCcw, Copy, Check } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  useAgentChat,
  type UseAgentChatOptions,
  type Message,
} from '../hooks/useAgentChat.js';
import { useTypingEffect } from '../hooks/useTypingEffect.js';
import {
  resolveTheme,
  createStyles,
  KEYFRAMES_CSS,
  MARKDOWN_CSS,
  INTERACTIVE_CSS,
  type ChatTheme,
} from './styles.js';

export interface AgentChatWidgetProps extends UseAgentChatOptions {
  theme?: ChatTheme;
  initialOpen?: boolean;
  placeholder?: string;
  subtitle?: string;
  greeting?: string;
  suggestions?: string[];
  botName?: string;
  /** Custom avatar element displayed for the bot. Accepts any React node: SVG, image, icon component, etc. Falls back to the built-in sun-burst avatar when omitted. */
  botAvatar?: React.ReactNode;
  /** When true, the message list auto-scrolls to the bottom while the assistant is typing. @default true */
  autoScroll?: boolean;
  /** Called when the chat panel is opened or closed. */
  onToggle?: (isOpen: boolean) => void;
}

const BotAvatar = ({
  size = 34,
  color = '#D4775A',
  colorLight = '#E8A878',
  children,
}: {
  size?: number;
  color?: string;
  colorLight?: string;
  children?: React.ReactNode;
}) => {
  if (children) {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="11" fill={colorLight} />
      <circle cx="24" cy="24" r="7" fill={color} />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const x1 = 24 + Math.cos(a) * 14;
        const y1 = 24 + Math.sin(a) * 14;
        const x2 = 24 + Math.cos(a) * 20;
        const y2 = 24 + Math.sin(a) * 20;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
};

export function AgentChatWidget(props: AgentChatWidgetProps) {
  const {
    theme: themeProp,
    initialOpen = false,
    placeholder = 'Write a message…',
    subtitle = "We're here to help",
    greeting,
    suggestions,
    botName = 'Assistant',
    botAvatar,
    autoScroll = true,
    onToggle,
    ...hookOptions
  } = props;

  const theme = resolveTheme(themeProp);
  const styles = createStyles(theme);

  const [isOpen, setIsOpen] = useState(initialOpen);

  const toggle = useCallback((next: boolean) => {
    setIsOpen(next);
    onToggle?.(next);
  }, [onToggle]);
  const { messages, sendMessage, isLoading, isReady, resetSession } =
    useAgentChat(hookOptions);

  const animatedIdsRef = useRef(new Set<string>());
  const markAnimated = useCallback((id: string) => {
    animatedIdsRef.current.add(id);
  }, []);

  const handleReset = useCallback(() => {
    animatedIdsRef.current.clear();
    resetSession();
  }, [resetSession]);

  return (
    <div style={styles.container} role="complementary" aria-label="Chat widget">
      <style>{KEYFRAMES_CSS}</style>
      <style>{MARKDOWN_CSS}</style>
      <style>{INTERACTIVE_CSS}</style>
      <style>{`
        :root { --rcw-primary: ${theme.primaryColor}; }
        .rcw-scrollarea { scrollbar-width: none; }
        .rcw-scrollarea::-webkit-scrollbar { display: none; }
        .rcw-input-wrapper:focus-within {
          border-color: ${theme.primaryColor} !important;
        }
      `}</style>
      {isOpen && (
        <ChatPanel
          styles={styles}
          theme={theme}
          messages={messages}
          sendMessage={sendMessage}
          isLoading={isLoading}
          isReady={isReady}
          placeholder={placeholder}
          subtitle={subtitle}
          greeting={greeting}
          suggestions={suggestions}
          botName={botName}
          botAvatar={botAvatar}
          autoScroll={autoScroll}
          animatedIds={animatedIdsRef.current}
          onMessageAnimated={markAnimated}
          onReset={handleReset}
          onClose={() => toggle(false)}
        />
      )}
      <button
        style={styles.bubble}
        className="rcw-bubble-btn"
        onClick={() => toggle(!isOpen)}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <X size={20} strokeWidth={2.2} />
        ) : (
          <BotAvatar size={40} color={theme.primaryColor} colorLight={theme.primarySoftColor}>{botAvatar}</BotAvatar>
        )}
      </button>
    </div>
  );
}

function ChatPanel(props: {
  styles: ReturnType<typeof createStyles>;
  theme: Required<ChatTheme>;
  messages: Message[];
  sendMessage: (text: string) => void;
  isLoading: boolean;
  isReady: boolean;
  placeholder: string;
  subtitle: string;
  greeting?: string;
  suggestions?: string[];
  botName: string;
  botAvatar?: React.ReactNode;
  autoScroll: boolean;
  animatedIds: Set<string>;
  onMessageAnimated: (id: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const {
    styles,
    theme,
    messages,
    sendMessage,
    isLoading,
    isReady,
    placeholder,
    subtitle,
    greeting,
    suggestions = ['I need help getting started', 'How does billing work?', 'I have a question'],
    botName,
    botAvatar,
    autoScroll,
    animatedIds,
    onMessageAnimated,
    onReset,
    onClose,
  } = props;
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const animatingMsgRef = useRef<string | null>(null);

  const handleAnimatingChange = useCallback((animating: boolean) => {
    setIsTyping(animating);
    if (!animating && animatingMsgRef.current) {
      onMessageAnimated(animatingMsgRef.current);
      animatingMsgRef.current = null;
    }
  }, [onMessageAnimated]);

  const isBusy = isLoading || isTyping;

  const scrollToBottom = () => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    if (autoScroll) scrollToBottom();
  }, [messages, autoScroll]);

  useEffect(() => {
    if (!autoScroll || !isBusy) return;
    const id = setInterval(scrollToBottom, 60);
    return () => clearInterval(id);
  }, [autoScroll, isBusy]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const prevBusyRef = useRef(isBusy);
  useEffect(() => {
    if (prevBusyRef.current && !isBusy) {
      inputRef.current?.focus();
    }
    prevBusyRef.current = isBusy;
  }, [isBusy]);

  const resizeTextarea = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 20)}px`;
  }, []);

  const handleSend = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isBusy || !isReady) return;
    sendMessage(msg);
    if (!text) setInput('');
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
      inputRef.current?.focus();
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasMessages = messages.length > 0;
  const hasInput = input.trim().length > 0;

  return (
    <div style={styles.panel} role="dialog" aria-label="Chat conversation">
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerAvatar}>
          <BotAvatar size={34} color={theme.primaryColor} colorLight={theme.primarySoftColor}>{botAvatar}</BotAvatar>
        </div>
        <div style={styles.headerInfo}>
          <div style={styles.headerTitle}>{botName}</div>
          <div style={styles.headerSubtitle}>
            <span style={styles.statusDot} />
            {subtitle}
          </div>
        </div>
        <div style={styles.headerActions}>
          <button
            style={styles.iconButton}
            className="rcw-icon-btn"
            onClick={onReset}
            aria-label="Reset session"
          >
            <RotateCcw size={14} strokeWidth={1.7} />
          </button>
          <button
            style={styles.iconButton}
            className="rcw-icon-btn"
            onClick={onClose}
            aria-label="Close chat"
          >
            <X size={14} strokeWidth={1.7} />
          </button>
        </div>
      </div>

      {/* Message area */}
      <div
        style={styles.messageList}
        className="rcw-scrollarea"
        ref={listRef}
        role="log"
        aria-live="polite"
      >
        {!hasMessages ? (
          <EmptyState
            styles={styles}
            theme={theme}
            greeting={greeting}
            suggestions={suggestions}
            botName={botName}
            botAvatar={botAvatar}
            onSuggestionClick={(text) => handleSend(text)}
          />
        ) : (
          <>
            {messages.map((msg, idx) => {
              if (msg.role === 'assistant' && !msg.content) return null;
              const isLastAssistant =
                msg.role === 'assistant' && idx === messages.length - 1;
              const shouldAnimate = isLastAssistant && !animatedIds.has(msg.id);
              if (shouldAnimate) animatingMsgRef.current = msg.id;
              return (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  styles={styles}
                  theme={theme}
                  botAvatar={botAvatar}
                  animate={shouldAnimate}
                  onAnimatingChange={shouldAnimate ? handleAnimatingChange : undefined}
                />
              );
            })}
            {isLoading && messages[messages.length - 1]?.content === '' && (
              <TypingIndicator styles={styles} theme={theme} botAvatar={botAvatar} />
            )}
          </>
        )}
      </div>

      {/* Composer */}
      <div style={styles.inputContainer}>
        <div style={styles.inputWrapper} className="rcw-input-wrapper">
          <textarea
            ref={inputRef}
            className="rcw-input-field"
            style={styles.textarea}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              resizeTextarea();
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={!isReady || isBusy}
            rows={1}
            aria-label="Chat message input"
          />
          <button
            className="rcw-send-btn"
            style={hasInput && isReady && !isBusy ? styles.sendButton : styles.sendButtonInactive}
            onClick={() => handleSend()}
            disabled={!isReady || isBusy || !hasInput}
            aria-label="Send message"
          >
            <ArrowRight size={14} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState(props: {
  styles: ReturnType<typeof createStyles>;
  theme: Required<ChatTheme>;
  greeting?: string;
  suggestions: string[];
  botName: string;
  botAvatar?: React.ReactNode;
  onSuggestionClick: (text: string) => void;
}) {
  const { styles, theme, greeting, suggestions, botName, onSuggestionClick, botAvatar} = props;

  if (greeting) {
    return (
      <div style={{ padding: '4px 0' }}>
        <div style={styles.welcomeTitle}>
          {greeting.split('\n').map((line, i) => (
            <React.Fragment key={i}>
              {i > 0 && <br />}
              {line}
            </React.Fragment>
          ))}
        </div>
        <div style={styles.welcomeCard}>
          <div style={styles.welcomeCardIcon}>
            <Sparkles size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textColor }}>
              Ask {botName} anything
            </div>
            <div style={{ fontSize: '12px', color: theme.textSoftColor, marginTop: '1px' }}>
              Answers in seconds, not hours
            </div>
          </div>
        </div>
        <div style={styles.sectionLabel}>Suggestions</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {suggestions.map((q) => (
            <button
              key={q}
              className="rcw-suggestion-btn"
              style={styles.suggestionButton}
              onClick={() => onSuggestionClick(q)}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.emptyState}>
      <BotAvatar size={48} color={theme.primaryColor} colorLight={theme.primarySoftColor}>{botAvatar}</BotAvatar>
      <div>
        <div style={styles.emptyTitle}>How can we help?</div>
        <div style={styles.emptySubtitle}>
          Start a conversation below — or pick a question to get things moving.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '4px' }}>
        {suggestions.map((q) => (
          <button
            key={q}
            className="rcw-suggestion-btn"
            style={styles.suggestionButton}
            onClick={() => onSuggestionClick(q)}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble(props: {
  msg: Message;
  styles: ReturnType<typeof createStyles>;
  theme: Required<ChatTheme>;
  botAvatar?: React.ReactNode;
  animate?: boolean;
  onAnimatingChange?: (animating: boolean) => void;
}) {
  const { msg, styles, theme, botAvatar, animate = false, onAnimatingChange } = props;
  const isUser = msg.role === 'user';

  return (
    <div
      className="rcw-msg-row"
      style={{
        ...styles.messageRow,
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      {!isUser && (
        <div style={styles.avatarSmall}>
          <BotAvatar size={20} color={theme.primaryColor} colorLight={theme.primarySoftColor}>{botAvatar}</BotAvatar>
        </div>
      )}
      <div style={isUser ? styles.messageWrapperUser : styles.messageWrapperAssistant}>
        <div style={isUser ? styles.messageBubbleUser : styles.messageBubbleAssistant}>
          {msg.role === 'assistant' ? (
            animate ? (
              <AnimatedContent content={msg.content} onAnimatingChange={onAnimatingChange} />
            ) : (
              <StaticContent content={msg.content} />
            )
          ) : (
            msg.content
          )}
        </div>
        <MessageActions content={msg.content} styles={styles} isUser={isUser} />
      </div>
    </div>
  );
}

function MessageActions(props: {
  content: string;
  styles: ReturnType<typeof createStyles>;
  isUser: boolean;
}) {
  const { content, styles, isUser } = props;
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [content]);

  return (
    <div
      className="rcw-action-bar"
      style={{
        ...styles.actionBar,
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <button
        className="rcw-action-btn"
        style={styles.actionButton}
        onClick={handleCopy}
        aria-label={copied ? 'Copied' : 'Copy message'}
      >
        {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={2} />}
      </button>
    </div>
  );
}

const markdownComponents = {
  a: (props: React.ComponentPropsWithoutRef<'a'>) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};

function StaticContent(props: { content: string }) {
  return (
    <div className="rcw-markdown">
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {props.content}
      </Markdown>
    </div>
  );
}

function AnimatedContent(props: { content: string; onAnimatingChange?: (animating: boolean) => void }) {
  const { text: displayedText, isAnimating } = useTypingEffect(props.content);

  useEffect(() => {
    props.onAnimatingChange?.(isAnimating);
  }, [isAnimating, props.onAnimatingChange]);

  if (!displayedText) return null;

  return (
    <div className="rcw-markdown">
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {displayedText}
      </Markdown>
    </div>
  );
}

function TypingIndicator(props: {
  styles: ReturnType<typeof createStyles>;
  theme: Required<ChatTheme>;
  botAvatar?: React.ReactNode;
}) {
  const { theme, botAvatar } = props;
  return (
    <div style={{ ...props.styles.messageRow, justifyContent: 'flex-start' }}>
      <div style={props.styles.avatarSmall}>
        <BotAvatar size={20} color={theme.primaryColor} colorLight={theme.primarySoftColor}>{botAvatar}</BotAvatar>
      </div>
      <div style={props.styles.typingDots} aria-label="Assistant is typing">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              ...props.styles.dot,
              animationName: 'rcw-bounce',
              animationDuration: '1.3s',
              animationTimingFunction: 'ease-in-out',
              animationIterationCount: 'infinite',
              animationDelay: `${i * 0.18}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

