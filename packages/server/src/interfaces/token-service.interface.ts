export interface TokenPayload {
  workspaceId: string;
  sessionId: string;
  userId?: string;
  fingerprint?: string;
}

export interface TokenService {
  /** Sign a payload into a JWT with the given TTL in seconds. */
  sign(payload: TokenPayload, ttlSeconds: number): Promise<string>;

  /** Verify a JWT and return its payload. Throws on invalid/expired tokens. */
  verify(token: string): Promise<TokenPayload>;
}
