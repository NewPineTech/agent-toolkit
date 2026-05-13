import { describe, expect, it } from "vitest";
import { CapabilityToolRegistry } from "../tool-registry.js";

describe("CapabilityToolRegistry", () => {
  it("blocks execution when required permissions are missing", async () => {
    const registry = new CapabilityToolRegistry([
      {
        name: "Create Ticket",
        capability: "ticket.create",
        description: "Create an internal ticket",
        riskLevel: "medium",
        requiredPermissions: ["ticket:write"],
        requiresConfirmation: true,
        timeoutMs: 5000,
        retryPolicy: { maxAttempts: 1 },
        auditRequired: true,
        async execute() {
          return { status: "success", data: { id: "T-1" } };
        },
      },
    ]);

    await expect(
      registry.execute({
        capability: "ticket.create",
        messages: [{ role: "user", content: "Create a ticket" }],
        userContext: {
          userId: "user_1",
          role: "employee",
          permissions: [],
        },
        requestContext: {
          sessionId: "session_1",
          requestId: "request_1",
        },
      }),
    ).rejects.toMatchObject({
      code: "TOOL_PERMISSION_DENIED",
    });
  });

  it("returns a confirmation-required plan without executing sensitive tools", async () => {
    let executed = false;
    const registry = new CapabilityToolRegistry([
      {
        name: "Create Ticket",
        capability: "ticket.create",
        description: "Create an internal ticket",
        riskLevel: "medium",
        requiredPermissions: ["ticket:write"],
        requiresConfirmation: true,
        timeoutMs: 5000,
        retryPolicy: { maxAttempts: 1 },
        auditRequired: true,
        async execute() {
          executed = true;
          return { status: "success", data: { id: "T-1" } };
        },
      },
    ]);

    const response = await registry.execute({
      capability: "ticket.create",
      messages: [{ role: "user", content: "Create a ticket" }],
      userContext: {
        userId: "user_1",
        role: "employee",
        permissions: ["ticket:write"],
      },
      requestContext: {
        sessionId: "session_1",
        requestId: "request_1",
      },
    });

    expect(response).toMatchObject({
      toolName: "Create Ticket",
      requiresConfirmation: true,
    });
    expect(response).not.toHaveProperty("result");
    expect(executed).toBe(false);
  });

  it("blocks execution when prepared input fails schema validation", async () => {
    let executed = false;
    const registry = new CapabilityToolRegistry([
      {
        name: "Create Ticket",
        capability: "ticket.create",
        description: "Create an internal ticket",
        riskLevel: "low",
        requiredPermissions: ["ticket:write"],
        requiresConfirmation: false,
        timeoutMs: 5000,
        retryPolicy: { maxAttempts: 1 },
        auditRequired: true,
        inputSchema: {
          validate(input) {
            return typeof input["title"] === "string"
              ? { valid: true }
              : { valid: false, message: "title is required" };
          },
        },
        prepareArgs() {
          return {};
        },
        async execute() {
          executed = true;
          return { status: "success", data: { id: "T-1" } };
        },
      },
    ]);

    await expect(
      registry.execute({
        capability: "ticket.create",
        messages: [{ role: "user", content: "Create a ticket" }],
        userContext: {
          userId: "user_1",
          role: "employee",
          permissions: ["ticket:write"],
        },
        requestContext: {
          sessionId: "session_1",
          requestId: "request_1",
        },
      }),
    ).rejects.toMatchObject({
      code: "TOOL_INPUT_INVALID",
    });
    expect(executed).toBe(false);
  });

  it("executes low-risk tools after permission and schema checks pass", async () => {
    const registry = new CapabilityToolRegistry([
      {
        name: "Search Docs",
        capability: "docs.search",
        description: "Search internal docs",
        riskLevel: "low",
        requiredPermissions: ["docs:read"],
        requiresConfirmation: false,
        timeoutMs: 5000,
        retryPolicy: { maxAttempts: 1 },
        auditRequired: false,
        inputSchema: {
          validate(input) {
            return typeof input["query"] === "string"
              ? { valid: true }
              : { valid: false, message: "query is required" };
          },
        },
        prepareArgs() {
          return { query: "approval policy" };
        },
        async execute(_request, args) {
          return {
            status: "success",
            data: { query: args["query"], count: 2 },
          };
        },
      },
    ]);

    await expect(
      registry.execute({
        capability: "docs.search",
        messages: [{ role: "user", content: "Search docs" }],
        userContext: {
          userId: "user_1",
          role: "employee",
          permissions: ["docs:read"],
        },
        requestContext: {
          sessionId: "session_1",
          requestId: "request_1",
        },
      }),
    ).resolves.toMatchObject({
      args: { query: "approval policy" },
      requiresConfirmation: false,
      result: {
        status: "success",
        data: { query: "approval policy", count: 2 },
      },
    });
  });

  it("lists registered capabilities for router context", () => {
    const registry = new CapabilityToolRegistry([
      {
        name: "Search Docs",
        capability: "docs.search",
        description: "Search internal docs",
        riskLevel: "low",
        requiredPermissions: ["docs:read"],
        requiresConfirmation: false,
        timeoutMs: 5000,
        retryPolicy: { maxAttempts: 1 },
        auditRequired: false,
        async execute() {
          return { status: "success", data: {} };
        },
      },
    ]);

    expect(registry.listCapabilities()).toEqual(["docs.search"]);
  });
});
