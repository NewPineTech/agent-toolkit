export function parseDomains(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((domain) => domain.trim())
    .filter(Boolean);
}

export function parsePositiveInteger(
  value: string | undefined,
  fallback?: number,
): number | undefined {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got "${value}"`);
  }
  return parsed;
}
