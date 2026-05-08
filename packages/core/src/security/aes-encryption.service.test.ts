import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AesEncryptionService } from "../index.js";

const VALID_KEY = randomBytes(32).toString("hex");

describe("AesEncryptionService", () => {
  it("encrypts and decrypts a string", () => {
    const encryptionService = new AesEncryptionService(VALID_KEY);
    const plaintext = "sk-ragflow-secret-key-12345";

    const ciphertext = encryptionService.encrypt(plaintext);

    expect(ciphertext).not.toBe(plaintext);
    expect(encryptionService.decrypt(ciphertext)).toBe(plaintext);
  });

  it("rejects invalid key length", () => {
    expect(() => new AesEncryptionService("abcd")).toThrow(
      "64-character hex string",
    );
  });
});
