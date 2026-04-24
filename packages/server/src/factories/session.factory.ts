import { nanoid } from 'nanoid';
import type { Session } from '@agent-toolkit/types';

export class SessionFactory {
  create(params: {
    workspaceId: string;
    ttlMinutes: number;
    userId?: string;
    fingerprint?: string;
  }): Session {
    const now = new Date();
    return {
      id: `sess_${nanoid(21)}`,
      workspaceId: params.workspaceId,
      providerSessionId: null,
      userId: params.userId ?? null,
      userFingerprint: params.fingerprint ?? null,
      metadata: {},
      createdAt: now,
      lastActiveAt: now,
      expiresAt: new Date(now.getTime() + params.ttlMinutes * 60 * 1000),
    };
  }
}
