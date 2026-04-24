import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { AgentChatWidget } from './AgentChatWidget.js';

const meta = {
  title: 'Widget/AgentChatWidget',
  component: AgentChatWidget,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'warm', value: '#FFF8EE' },
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#1B1712' },
      ],
    },
  },
  argTypes: {
    workspaceId: { control: 'text', description: 'Workspace identifier (required)' },

    subtitle: { control: 'text', description: 'Header subtitle text' },
    placeholder: { control: 'text', description: 'Input placeholder text' },
    initialOpen: { control: 'boolean', description: 'Open panel on mount' },
    greeting: { control: 'text', description: 'Large welcome greeting (supports \\n for line breaks)' },
    botName: { control: 'text', description: 'Bot display name used in welcome card' },
    suggestions: { control: 'object', description: 'Quick-reply suggestion strings' },
    theme: { control: 'object', description: 'Visual theme overrides' },
    user: { control: 'object', description: 'End-user identity for session' },
    autoScroll: { control: 'boolean', description: 'Auto-scroll message list while assistant is typing' },
    onError: { action: 'onError', description: 'Callback when an error occurs' },
  },
} satisfies Meta<typeof AgentChatWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    workspaceId: 'ws_dev_001',

    initialOpen: false,
    autoScroll: true
  },
};

export const OpenWithEmptyState: Story = {
  args: {
    workspaceId: 'ws_dev_001',

    initialOpen: true,
    suggestions: [
      'I need help with billing',
      'How do I invite my team?',
      'Is there a mobile app?',
    ],
  },
};

export const WithGreeting: Story = {
  args: {
    workspaceId: 'ws_dev_001',

    subtitle: "We're here all weekend",
    initialOpen: true,
    botName: 'Coco',
    greeting: 'Hey there —\nhow can we help?',
    suggestions: [
      'Setting up my first workspace',
      'How does billing work?',
      'I have a question about my account',
    ],
  },
};

export const CustomTheme: Story = {
  args: {
    workspaceId: 'ws_dev_001',

    botName: 'Help Desk',
    subtitle: 'Online now',
    initialOpen: true,
    theme: {
      primaryColor: '#059669',
      primaryDeepColor: '#064e3b',
      primarySoftColor: '#ecfdf5',
      backgroundColor: '#f0fdf4',
      surfaceColor: '#ffffff',
      textColor: '#064e3b',
      textSoftColor: '#6b7f6b',
      textMuteColor: '#9ca89c',
      borderColor: '#d1e7d5',
      borderSoftColor: '#e6f4ea',
      borderRadius: 16,
    },
  },
};

export const BottomLeft: Story = {
  args: {
    workspaceId: 'ws_dev_001',

    botName: 'Support',
    subtitle: 'Online',
    initialOpen: true,
    theme: {
      position: 'bottom-left',
    },
  },
};

export const CustomPlaceholder: Story = {
  args: {
    workspaceId: 'ws_dev_001',

    initialOpen: true,
    placeholder: 'Ask me anything about your account…',
    botName: 'Account Help',
    subtitle: 'Typically replies in seconds',
  },
};

export const WithUserIdentity: Story = {
  args: {
    workspaceId: 'ws_dev_001',

    initialOpen: true,
    user: { id: 'usr_42', name: 'Jane Doe', email: 'jane@example.com' },
    subtitle: 'Your personal assistant',
    botName: 'Atlas',
    greeting: 'Welcome back, Jane.\nWhat can I help with today?',
    suggestions: [
      'Check my latest invoice',
      'Update my payment method',
      'Talk to a human',
    ],
  },
};

export const AutoScrollDisabled: Story = {
  args: {
    workspaceId: 'ws_dev_001',

    initialOpen: true,
    autoScroll: false,
    botName: 'Manual Scroll',
    subtitle: 'Auto-scroll is off',
  },
};

export const MinimalBubble: Story = {
  args: {
    workspaceId: 'ws_dev_001',
  },
};

export const CustomAvatarImage: Story = {
  args: {
    workspaceId: 'ws_dev_001',

    initialOpen: true,
    botName: 'Ava',
    botAvatar: React.createElement('img', {
      src: 'https://api.dicebear.com/9.x/bottts/svg?seed=ava',
      alt: 'Bot',
      style: { width: '100%', height: '100%', borderRadius: '50%' },
    }),
  },
};

export const CustomAvatarEmoji: Story = {
  args: {
    workspaceId: 'ws_dev_001',

    initialOpen: true,
    botName: 'Sparky',
    botAvatar: React.createElement('span', { style: { fontSize: '1.4em', lineHeight: 1 } }, '⚡'),
  },
};
