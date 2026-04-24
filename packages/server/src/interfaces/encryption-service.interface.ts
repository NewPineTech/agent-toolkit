export interface EncryptionService {
  /** Encrypt plaintext. Returns a string encoding the IV + ciphertext + auth tag. */
  encrypt(plaintext: string): string;

  /** Decrypt a previously encrypted string. Throws on tampered or invalid data. */
  decrypt(ciphertext: string): string;
}
