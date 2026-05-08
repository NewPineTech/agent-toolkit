export { normalizeApiUrl } from "@agent-toolkit/core";

export interface EndablePool {
  end(): Promise<void>;
}

export function buildOriginHeaders(origin?: string): Record<string, string> {
  return origin ? { Origin: origin } : {};
}

export function requiredOption(
  value: string | undefined,
  name: string,
): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function addUpdateField(
  fields: string[],
  values: unknown[],
  column: string,
  value: unknown,
) {
  if (value === undefined) return;
  values.push(value);
  fields.push(`${column} = $${values.length}`);
}

export async function withPool<P extends EndablePool, T>(
  createPool: () => P,
  work: (pool: P) => Promise<T>,
): Promise<T> {
  const pool = createPool();
  try {
    return await work(pool);
  } finally {
    await pool.end();
  }
}
