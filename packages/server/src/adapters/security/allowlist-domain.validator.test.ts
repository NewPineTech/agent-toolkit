import { describe, it, expect } from 'vitest';
import { AllowlistDomainValidator } from './allowlist-domain.validator.js';

describe('AllowlistDomainValidator', () => {
  const validator = new AllowlistDomainValidator();

  it('returns false for null origin', () => {
    expect(validator.validate(null, ['https://example.com'])).toBe(false);
  });

  it('returns false for undefined origin', () => {
    expect(validator.validate(undefined, ['https://example.com'])).toBe(false);
  });

  it('returns false for empty allowlist', () => {
    expect(validator.validate('https://example.com', [])).toBe(false);
  });

  it('matches exact origin', () => {
    expect(
      validator.validate('https://example.com', ['https://example.com']),
    ).toBe(true);
  });

  it('is case insensitive', () => {
    expect(
      validator.validate('https://EXAMPLE.COM', ['https://example.com']),
    ).toBe(true);
  });

  it('strips trailing slash', () => {
    expect(
      validator.validate('https://example.com/', ['https://example.com']),
    ).toBe(true);
  });

  it('rejects non-matching origin', () => {
    expect(
      validator.validate('https://evil.com', ['https://example.com']),
    ).toBe(false);
  });

  it('supports wildcard subdomain matching', () => {
    expect(
      validator.validate('https://app.example.com', ['*.example.com']),
    ).toBe(true);
  });

  it('matches root domain for wildcard pattern', () => {
    expect(
      validator.validate('https://example.com', ['*.example.com']),
    ).toBe(true);
  });

  it('matches deeply nested subdomains for wildcard', () => {
    expect(
      validator.validate('https://a.b.c.example.com', ['*.example.com']),
    ).toBe(true);
  });

  it('does not match unrelated domain for wildcard', () => {
    expect(
      validator.validate('https://notexample.com', ['*.example.com']),
    ).toBe(false);
  });

  it('matches any domain in the allowlist', () => {
    const allowed = ['https://a.com', 'https://b.com', 'https://c.com'];
    expect(validator.validate('https://b.com', allowed)).toBe(true);
  });
});
