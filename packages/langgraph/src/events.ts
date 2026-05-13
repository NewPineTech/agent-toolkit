export type LangGraphRuntimeEvent =
  | LangGraphMetadataEvent
  | LangGraphTokenEvent
  | LangGraphToolCallStartedEvent
  | LangGraphToolCallCompletedEvent
  | LangGraphConfirmationRequiredEvent
  | LangGraphAuditEvent
  | LangGraphDoneEvent
  | LangGraphErrorEvent;

export interface LangGraphMetadataEvent {
  type: "metadata";
  data: {
    route: string;
    capability?: string;
    retrieval: RetrievalChunk[];
    plan?: unknown;
    toolResults?: unknown[];
    artifacts?: ResponseArtifact[];
    references?: ResponseReference[];
  };
}

export interface LangGraphTokenEvent {
  type: "token";
  content: string;
}

export interface LangGraphToolCallStartedEvent {
  type: "tool_call_started";
  toolName: string;
  capability: string;
}

export interface LangGraphToolCallCompletedEvent {
  type: "tool_call_completed";
  toolName: string;
  capability: string;
  status: "success" | "failed";
}

export interface LangGraphConfirmationRequiredEvent {
  type: "confirmation_required";
  capability: string;
  action: string;
  summary: string;
  riskLevel: RiskLevel;
}

export interface LangGraphAuditEvent {
  type: "audit";
  event: AuditEvent;
}

export interface LangGraphDoneEvent {
  type: "done";
  sessionId: string;
  providerSessionId: string;
}

export interface LangGraphErrorEvent {
  type: "error";
  code: string;
  message: string;
  recoverable: boolean;
}

export interface RetrievalChunk {
  content: string;
  source?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface ResponseReference {
  id: string;
  title?: string;
  source?: string;
  score?: number;
}

export type ResponseArtifact =
  | {
      type: "chart";
      title?: string;
      schema: "vega-lite" | "lightweight";
      spec: Record<string, unknown>;
    }
  | {
      type: "image";
      title?: string;
      alt: string;
      source: string;
      metadata?: Record<string, unknown>;
    }
  | {
      type: "table";
      title?: string;
      columns: string[];
      rows: Array<Record<string, unknown>>;
    };

export interface AuditEvent {
  eventType: string;
  requestId: string;
  userId?: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export type RiskLevel = "low" | "medium" | "high";
