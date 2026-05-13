import { describe, expect, it, vi } from "vitest";
import {
  createLangGraphRuntime,
  type LangGraphModelClient,
  type Retriever,
} from "../index.js";

function createModel(route: string, tokens: string[]): LangGraphModelClient {
  return {
    async classifyRoute() {
      return {
        route,
        confidence: 0.93,
        reason: `test route ${route}`,
      };
    },
    async *streamText() {
      for (const token of tokens) {
        yield token;
      }
    },
  } as LangGraphModelClient;
}

const retriever: Retriever = {
  async retrieve() {
    return [
      {
        content: "Handbook says approve requests in Jira.",
        source: "handbook.md",
        score: 0.91,
      },
    ];
  },
};

async function collectEvents(
  runtime: ReturnType<typeof createLangGraphRuntime>,
) {
  const events = [];
  for await (const event of runtime.stream({
    sessionId: "session_1",
    requestId: "request_1",
    userContext: {
      userId: "user_1",
      role: "employee",
      permissions: ["docs:read"],
    },
    messages: [{ role: "user", content: "How do approvals work?" }],
  })) {
    events.push(event);
  }
  return events;
}

describe("createLangGraphRuntime", () => {
  it("routes knowledge questions through retrieval and streamed generation", async () => {
    const runtime = createLangGraphRuntime({
      model: createModel("knowledge_qa", ["Hello", " world"]),
      retriever,
    });

    const events = await collectEvents(runtime);

    expect(events).toEqual([
      {
        type: "metadata",
        data: {
          route: "knowledge_qa",
          capability: undefined,
          retrieval: [
            {
              content: "Handbook says approve requests in Jira.",
              source: "handbook.md",
              score: 0.91,
            },
          ],
          plan: undefined,
          toolResults: [],
          references: [
            {
              id: "ref_1",
              title: "handbook.md",
              source: "handbook.md",
              score: 0.91,
            },
          ],
          artifacts: [],
        },
      },
      { type: "token", content: "Hello" },
      { type: "token", content: " world" },
      { type: "done", sessionId: "session_1", providerSessionId: "session_1" },
    ]);
  });

  it("returns a clear unsupported response without pretending a tool ran", async () => {
    const runtime = createLangGraphRuntime({
      model: createModel("unsupported", ["ignored"]),
      retriever,
    });

    const events = await collectEvents(runtime);

    expect(events).toEqual([
      {
        type: "metadata",
        data: {
          route: "unsupported",
          capability: undefined,
          retrieval: [],
          plan: undefined,
          toolResults: [],
          references: [],
          artifacts: [],
        },
      },
      {
        type: "token",
        content:
          "I cannot safely handle that request with the configured capabilities.",
      },
      { type: "done", sessionId: "session_1", providerSessionId: "session_1" },
    ]);
  });

  it("routes free chat directly to streamed generation without retrieval", async () => {
    const runtime = createLangGraphRuntime({
      model: createModel("free_chat", ["Nice", " to chat"]),
    });

    const events = await collectEvents(runtime);

    expect(events).toEqual([
      {
        type: "metadata",
        data: {
          route: "free_chat",
          capability: undefined,
          retrieval: [],
          plan: undefined,
          toolResults: [],
          references: [],
          artifacts: [],
        },
      },
      { type: "token", content: "Nice" },
      { type: "token", content: " to chat" },
      { type: "done", sessionId: "session_1", providerSessionId: "session_1" },
    ]);
  });

  it("executes complex plans with retrieval and tool steps before generation", async () => {
    const runtime = createLangGraphRuntime({
      model: {
        async classifyRoute() {
          return {
            route: "complex_analysis",
            confidence: 0.91,
            reason: "needs multiple steps",
          };
        },
        async createPlan() {
          return {
            goal: "Analyze candidates",
            steps: [
              { id: "r1", type: "retrieval", instruction: "Find policy" },
              {
                id: "t1",
                type: "mcp_tool",
                instruction: "Search candidates",
                capability: "ai-recruitment.search_candidates",
              },
            ],
            responseFormat: ["markdown", "references"],
          };
        },
        async *streamText() {
          yield "Complex answer";
        },
      },
      retriever,
      toolRegistry: {
        async execute() {
          return {
            toolName: "search_candidates",
            args: { query: "candidate" },
            actionSummary: "Search candidates",
            riskLevel: "low",
            requiresConfirmation: false,
            result: { status: "success", data: { count: 2 } },
          };
        },
      },
    });

    const events = await collectEvents(runtime);

    expect(events[0]).toMatchObject({
      type: "metadata",
      data: {
        route: "complex_analysis",
        plan: {
          goal: "Analyze candidates",
        },
        toolResults: [
          { stepId: "r1", status: "success" },
          {
            stepId: "t1",
            capability: "ai-recruitment.search_candidates",
            status: "success",
          },
        ],
      },
    });
    expect(events).toContainEqual({ type: "token", content: "Complex answer" });
  });

  it("continues normal chat when knowledge retrieval is not configured", async () => {
    const warn = vi.fn();
    const runtime = createLangGraphRuntime({
      model: createModel("knowledge_qa", ["Fallback", " answer"]),
      onExternalWarning: warn,
    });

    const events = await collectEvents(runtime);

    expect(events).toEqual([
      {
        type: "metadata",
        data: {
          route: "knowledge_qa",
          capability: undefined,
          retrieval: [],
          plan: undefined,
          toolResults: [],
          references: [],
          artifacts: [],
        },
      },
      { type: "token", content: "Fallback" },
      { type: "token", content: " answer" },
      { type: "done", sessionId: "session_1", providerSessionId: "session_1" },
    ]);
    expect(warn).toHaveBeenCalledWith({
      dependency: "retriever",
      code: "RETRIEVER_NOT_CONFIGURED",
      message: "Knowledge retrieval is not configured",
    });
  });

  it("continues normal chat when knowledge retrieval fails", async () => {
    const warn = vi.fn();
    const runtime = createLangGraphRuntime({
      model: createModel("knowledge_qa", ["Fallback"]),
      retriever: {
        async retrieve() {
          throw new Error("RAGFlow unavailable");
        },
      },
      onExternalWarning: warn,
    });

    const events = await collectEvents(runtime);

    expect(events).toContainEqual({ type: "token", content: "Fallback" });
    expect(events).toContainEqual({
      type: "done",
      sessionId: "session_1",
      providerSessionId: "session_1",
    });
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: "error" }),
    );
    expect(warn).toHaveBeenCalledWith({
      dependency: "retriever",
      code: "RETRIEVER_UNAVAILABLE",
      message: "RAGFlow unavailable",
    });
  });

  it("continues normal chat when a tool action is routed without a registry", async () => {
    const warn = vi.fn();
    const runtime = createLangGraphRuntime({
      model: {
        async classifyRoute() {
          return {
            route: "tool_action",
            capability: "ticket.create",
            confidence: 0.88,
            reason: "test tool route",
          };
        },
        async *streamText() {
          yield "Tool fallback";
        },
      },
      retriever,
      onExternalWarning: warn,
    });

    const events = await collectEvents(runtime);

    expect(events).toEqual([
      {
        type: "metadata",
        data: {
          route: "tool_action",
          capability: "ticket.create",
          retrieval: [],
          plan: undefined,
          toolResults: [],
          references: [],
          artifacts: [],
        },
      },
      { type: "token", content: "Tool fallback" },
      { type: "done", sessionId: "session_1", providerSessionId: "session_1" },
    ]);
    expect(warn).toHaveBeenCalledWith({
      dependency: "toolRegistry",
      code: "TOOL_REGISTRY_NOT_CONFIGURED",
      message: "Tool capability ticket.create is not configured",
    });
  });

  it("continues normal chat when tool execution fails", async () => {
    const warn = vi.fn();
    const runtime = createLangGraphRuntime({
      model: {
        async classifyRoute() {
          return {
            route: "tool_action",
            capability: "ticket.create",
            confidence: 0.88,
            reason: "test tool route",
          };
        },
        async *streamText() {
          yield "Tool fallback";
        },
      },
      toolRegistry: {
        async execute() {
          throw new Error("MCP unavailable");
        },
      },
      onExternalWarning: warn,
    });

    const events = await collectEvents(runtime);

    expect(events).toContainEqual({ type: "token", content: "Tool fallback" });
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: "error" }),
    );
    expect(warn).toHaveBeenCalledWith({
      dependency: "toolRegistry",
      code: "TOOL_EXECUTION_FAILED",
      message: "MCP unavailable",
      capability: "ticket.create",
    });
  });

  it("emits confirmation_required instead of executing sensitive actions", async () => {
    const runtime = createLangGraphRuntime({
      model: {
        async classifyRoute() {
          return {
            route: "tool_action",
            capability: "ticket.create",
            confidence: 0.88,
            reason: "test tool route",
          };
        },
        async *streamText() {
          yield "should not stream before confirmation";
        },
      },
      toolRegistry: {
        async execute() {
          return {
            toolName: "Create Ticket",
            args: { title: "Fix login redirect" },
            actionSummary: "Create ticket: Fix login redirect",
            riskLevel: "medium",
            requiresConfirmation: true,
          };
        },
      },
    });

    const events = await collectEvents(runtime);

    expect(events).toEqual([
      {
        type: "metadata",
        data: {
          route: "tool_action",
          capability: "ticket.create",
          retrieval: [],
          plan: undefined,
          toolResults: [],
          references: [],
          artifacts: [],
        },
      },
      {
        type: "confirmation_required",
        capability: "ticket.create",
        action: "Create Ticket",
        summary: "Create ticket: Fix login redirect",
        riskLevel: "medium",
      },
      { type: "done", sessionId: "session_1", providerSessionId: "session_1" },
    ]);
  });
});
