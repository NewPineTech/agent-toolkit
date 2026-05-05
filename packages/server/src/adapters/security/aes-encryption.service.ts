import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { EncryptionService } from "../../interfaces/encryption-service.interface.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const ENCODING = "base64" as const;

export class AesEncryptionService implements EncryptionService {
  private readonly key: Buffer;

  constructor(encryptionKey: string) {
    this.key = Buffer.from(encryptionKey, "hex");
    if (this.key.length !== 32) {
      throw new Error(
        "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)",
      );
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, encrypted]).toString(ENCODING);
  }

  decrypt(ciphertext: string): string {
    const data = Buffer.from(ciphertext, ENCODING);

    if (data.length < IV_LENGTH + TAG_LENGTH) {
      throw new Error("Invalid ciphertext: too short");
    }

    const iv = data.subarray(0, IV_LENGTH);
    const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  }
}
