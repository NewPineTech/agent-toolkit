import { parseArgs } from "node:util";
import { z } from "zod";
import { createDatabase } from "./connection.js";
import { workspaces } from "./schema.js";
import { AesEncryptionService } from "../adapters/security/aes-encryption.service.js";

const argsSchema = z.object({
  id: z.string().min(1, "Workspace ID is required"),
  providerType: z.string().default("ragflow"),
  agentId: z.string().min(1, "Agent ID is required"),
  apiKey: z.string().min(1, "API key is required"),
  baseUrl: z.string().url("Base URL must be a valid URL"),
  domains: z.array(z.string()).default([]),
  authMode: z.enum(["anonymous", "authenticated", "both"]).default("anonymous"),
  maxRequests: z.coerce.number().int().positive().default(30),
  windowMs: z.coerce.number().int().positive().default(60000),
  maxMessageLength: z.coerce.number().int().positive().default(4000),
});

function printUsage() {
  console.log(`
Usage: tsx src/db/create-workspace.ts [options]

Required:
  --id <string>              Workspace ID (e.g. ws_my_project)
  --agent-id <string>        RAGFlow agent UUID
  --api-key <string>         RAGFlow API key (will be encrypted)
  --base-url <string>        RAGFlow server URL

Optional:
  --provider-type <string>   Provider type (default: ragflow)
  --domains <string>         Comma-separated allowed origins
  --auth-mode <string>       anonymous | authenticated | both (default: anonymous)
  --max-requests <number>    Rate limit max requests (default: 30)
  --window-ms <number>       Rate limit window in ms (default: 60000)
  --max-message-length <n>   Max message length (default: 4000)

Environment:
  DATABASE_URL               PostgreSQL connection string (required)
  ENCRYPTION_KEY             AES-256 encryption key (required)

Example:
  tsx src/db/create-workspace.ts \\
    --id ws_acme_001 \\
    --agent-id 550e8400-e29b-41d4-a716-446655440000 \\
    --api-key ragflow-xxxxx \\
    --base-url https://ragflow.example.com \\
    --domains "https://acme.com,https://app.acme.com" \\
    --auth-mode anonymous
`);
}

async function main() {
  // Strip leading "--" leaked by pnpm's argument forwarding
  const rawArgv = process.argv.slice(2);
  const cleanArgv = rawArgv[0] === "--" ? rawArgv.slice(1) : rawArgv;

  const { values } = parseArgs({
    args: cleanArgv,
    options: {
      id: { type: "string" },
      "provider-type": { type: "string" },
      "agent-id": { type: "string" },
      "api-key": { type: "string" },
      "base-url": { type: "string" },
      domains: { type: "string" },
      "auth-mode": { type: "string" },
      "max-requests": { type: "string" },
      "window-ms": { type: "string" },
      "max-message-length": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: true,
  });

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    console.error("Error: DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const encryptionKey = process.env["ENCRYPTION_KEY"];
  if (!encryptionKey) {
    console.error("Error: ENCRYPTION_KEY environment variable is required");
    process.exit(1);
  }

  const parsed = argsSchema.safeParse({
    id: values.id,
    providerType: values["provider-type"],
    agentId: values["agent-id"],
    apiKey: values["api-key"],
    baseUrl: values["base-url"],
    domains: values.domains
      ? values.domains.split(",").map((d) => d.trim())
      : undefined,
    authMode: values["auth-mode"],
    maxRequests: values["max-requests"],
    windowMs: values["window-ms"],
    maxMessageLength: values["max-message-length"],
  });

  if (!parsed.success) {
    console.error("Validation errors:");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    console.error("\nRun with --help for usage information.");
    process.exit(1);
  }

  const args = parsed.data;
  const { db, pool } = createDatabase(connectionString);
  const encryption = new AesEncryptionService(encryptionKey);

  const encryptedApiKey = encryption.encrypt(args.apiKey);

  const [workspace] = await db
    .insert(workspaces)
    .values({
      id: args.id,
      providerType: args.providerType,
      providerAgentId: args.agentId,
      providerApiKey: encryptedApiKey,
      providerBaseUrl: args.baseUrl,
      allowedDomains: args.domains,
      authMode: args.authMode,
      rateLimitConfig: {
        maxRequests: args.maxRequests,
        windowMs: args.windowMs,
      },
      maxMessageLength: args.maxMessageLength,
    })
    .onConflictDoUpdate({
      target: workspaces.id,
      set: {
        providerType: args.providerType,
        providerAgentId: args.agentId,
        providerApiKey: encryptedApiKey,
        providerBaseUrl: args.baseUrl,
        allowedDomains: args.domains,
        authMode: args.authMode,
        rateLimitConfig: {
          maxRequests: args.maxRequests,
          windowMs: args.windowMs,
        },
        maxMessageLength: args.maxMessageLength,
      },
    })
    .returning({ id: workspaces.id, createdAt: workspaces.createdAt });

  console.log(`Workspace "${workspace!.id}" created successfully.`);
  console.log(`  Provider:    ${args.providerType}`);
  console.log(`  Agent ID:    ${args.agentId}`);
  console.log(`  Base URL:    ${args.baseUrl}`);
  console.log(`  Auth mode:   ${args.authMode}`);
  console.log(
    `  Domains:     ${args.domains.length > 0 ? args.domains.join(", ") : "(none)"}`,
  );
  console.log(`  Rate limit:  ${args.maxRequests} req / ${args.windowMs}ms`);

  await pool.end();
}

main().catch((err: unknown) => {
  console.error("Failed to create workspace:", err);
  process.exit(1);
});
