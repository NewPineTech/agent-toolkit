export interface ChatTokenEvent {
  type: 'token';
  content: string;
}

export interface ChatDoneEvent {
  type: 'done';
  sessionId: string;
  providerSessionId: string;
}

export interface ChatErrorEvent {
  type: 'error';
  code: string;
  message: string;
}

export interface ChatMetadataEvent {
  type: 'metadata';
  data: Record<string, unknown>;
}

export type ChatStreamEvent =
  | ChatTokenEvent
  | ChatDoneEvent
  | ChatErrorEvent
  | ChatMetadataEvent;
