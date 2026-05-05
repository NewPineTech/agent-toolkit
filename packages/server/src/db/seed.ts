import { createDatabase } from "./connection.js";
import { workspaces } from "./schema.js";
import { AesEncryptionService } from "../adapters/security/aes-encryption.service.js";

async function seed() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const encryptionKey = process.env["ENCRYPTION_KEY"];
  if (!encryptionKey) {
    throw new Error("ENCRYPTION_KEY is required");
  }

  const providerApiKey = process.env["SEED_PROVIDER_API_KEY"];
  if (!providerApiKey) {
    throw new Error("SEED_PROVIDER_API_KEY is required");
  }

  const providerAgentId = process.env["SEED_PROVIDER_AGENT_ID"];
  if (!providerAgentId) {
    throw new Error("SEED_PROVIDER_AGENT_ID is required");
  }

  const providerBaseUrl = process.env["SEED_PROVIDER_BASE_URL"];
  if (!providerBaseUrl) {
    throw new Error("SEED_PROVIDER_BASE_URL is required");
  }

  const { db, pool } = createDatabase(connectionString);
  const encryption = new AesEncryptionService(encryptionKey);

  console.log("Seeding database...");

  const encryptedApiKey = encryption.encrypt(providerApiKey);

  await db
    .insert(workspaces)
    .values({
      id: "ws_dev_001",
      providerType: "ragflow",
      providerAgentId,
      providerApiKey: encryptedApiKey,
      providerBaseUrl,
      allowedDomains: ["http://localhost:3001", "http://localhost:5173"],
      authMode: "anonymous",
      rateLimitConfig: { maxRequests: 30, windowMs: 60000 },
      maxMessageLength: 4000,
    })
    .onConflictDoUpdate({
      target: workspaces.id,
      set: {
        providerType: "ragflow",
        providerAgentId,
        providerApiKey: encryptedApiKey,
        providerBaseUrl,
        allowedDomains: ["http://localhost:3001", "http://localhost:5173"],
        authMode: "anonymous",
        rateLimitConfig: { maxRequests: 30, windowMs: 60000 },
        maxMessageLength: 4000,
      },
    });

  console.log("Seed complete.");
  await pool.end();
}

seed().catch((err: unknown) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
