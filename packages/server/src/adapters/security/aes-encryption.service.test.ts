import { describe, it, expect } from 'vitest';
import { AesEncryptionService } from './aes-encryption.service.js';
import { randomBytes } from 'node:crypto';

const VALID_KEY = randomBytes(32).toString('hex');

describe('AesEncryptionService', () => {
  it('throws if key is not 32 bytes', () => {
    expect(() => new AesEncryptionService('abcd')).toThrow(
      '64-character hex string',
    );
  });

  it('encrypts and decrypts a string', () => {
    const svc = new AesEncryptionService(VALID_KEY);
    const plaintext = 'sk-ragflow-secret-key-12345';
    const encrypted = svc.encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(svc.decrypt(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertexts for the same input (random IV)', () => {
    const svc = new AesEncryptionService(VALID_KEY);
    const a = svc.encrypt('same-input');
    const b = svc.encrypt('same-input');

    expect(a).not.toBe(b);
    expect(svc.decrypt(a)).toBe('same-input');
    expect(svc.decrypt(b)).toBe('same-input');
  });

  it('throws on tampered ciphertext', () => {
    const svc = new AesEncryptionService(VALID_KEY);
    const encrypted = svc.encrypt('test');
    const tampered =
      encrypted.slice(0, -4) +
      (encrypted.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');

    expect(() => svc.decrypt(tampered)).toThrow();
  });

  it('throws on truncated ciphertext', () => {
    const svc = new AesEncryptionService(VALID_KEY);
    expect(() => svc.decrypt('dG9vc2hvcnQ=')).toThrow('too short');
  });

  it('handles empty string encryption', () => {
    const svc = new AesEncryptionService(VALID_KEY);
    const encrypted = svc.encrypt('');
    expect(svc.decrypt(encrypted)).toBe('');
  });

  it('handles unicode content', () => {
    const svc = new AesEncryptionService(VALID_KEY);
    const text = '日本語テスト 🎉 café résumé';
    expect(svc.decrypt(svc.encrypt(text))).toBe(text);
  });

  it('cannot decrypt with a different key', () => {
    const svc1 = new AesEncryptionService(VALID_KEY);
    const svc2 = new AesEncryptionService(randomBytes(32).toString('hex'));
    const encrypted = svc1.encrypt('secret');

    expect(() => svc2.decrypt(encrypted)).toThrow();
  });
});
