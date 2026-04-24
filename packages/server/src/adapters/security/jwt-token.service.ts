import { SignJWT, jwtVerify } from 'jose';
import type {
  TokenService,
  TokenPayload,
} from '../../interfaces/token-service.interface.js';

export class JwtTokenService implements TokenService {
  private readonly secret: Uint8Array;

  constructor(jwtSecret: string) {
    this.secret = new TextEncoder().encode(jwtSecret);
  }

  async sign(payload: TokenPayload, ttlSeconds: number): Promise<string> {
    return new SignJWT({ ...payload })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .setIssuer('agent-toolkit')
      .sign(this.secret);
  }

  async verify(token: string): Promise<TokenPayload> {
    const { payload } = await jwtVerify(token, this.secret, {
      issuer: 'agent-toolkit',
    });

    const workspaceId = payload['workspaceId'];
    const sessionId = payload['sessionId'];

    if (typeof workspaceId !== 'string' || typeof sessionId !== 'string') {
      throw new Error('Invalid token payload: missing workspaceId or sessionId');
    }

    return {
      workspaceId,
      sessionId,
      userId:
        typeof payload['userId'] === 'string' ? payload['userId'] : undefined,
      fingerprint:
        typeof payload['fingerprint'] === 'string'
          ? payload['fingerprint']
          : undefined,
    };
  }
}
