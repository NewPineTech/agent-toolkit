import type {
  TokenService,
  TokenPayload,
} from "../interfaces/token-service.interface.js";

export class TokenFactory {
  constructor(private readonly tokenService: TokenService) {}

  async createSessionToken(params: {
    workspaceId: string;
    sessionId: string;
    ttlSeconds: number;
    userId?: string;
    fingerprint?: string;
  }): Promise<{ token: string; expiresAt: Date }> {
    const payload: TokenPayload = {
      workspaceId: params.workspaceId,
      sessionId: params.sessionId,
      userId: params.userId,
      fingerprint: params.fingerprint,
    };

    const token = await this.tokenService.sign(payload, params.ttlSeconds);
    const expiresAt = new Date(Date.now() + params.ttlSeconds * 1000);

    return { token, expiresAt };
  }
}
