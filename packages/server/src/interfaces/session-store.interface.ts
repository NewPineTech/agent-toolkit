import type { Session } from '@agent-toolkit/types';

export interface SessionStore {
  /** Persist a new session. */
  create(session: Session): Promise<void>;

  /** Find a session by its widget-side ID. Returns null if not found. */
  findById(id: string): Promise<Session | null>;

  /** Update the last_active_at timestamp for a session. */
  updateLastActive(id: string): Promise<void>;

  /** Store the provider's session ID after first message creates it. */
  updateProviderSessionId(id: string, providerSessionId: string): Promise<void>;

  /** Find active session by workspace + user fingerprint. */
  findByWorkspaceAndFingerprint(
    workspaceId: string,
    fingerprint: string,
  ): Promise<Session | null>;
}
