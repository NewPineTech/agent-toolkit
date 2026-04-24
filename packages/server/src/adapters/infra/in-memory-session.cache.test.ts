import { describe, it, expect, beforeEach } from 'vitest';
import { InMemorySessionCache } from './in-memory-session.cache.js';
import type { Session } from '@agent-toolkit/types';

const makeSession = (id = 'sess_1'): Session => ({
  id,
  workspaceId: 'ws_1',
  providerSessionId: null,
  userId: null,
  userFingerprint: null,
  metadata: {},
  createdAt: new Date(),
  lastActiveAt: new Date(),
  expiresAt: new Date(Date.now() + 3600_000),
});

describe('InMemorySessionCache', () => {
  let cache: InMemorySessionCache;

  beforeEach(() => {
    cache = new InMemorySessionCache();
  });

  it('returns null for missing key', async () => {
    expect(await cache.get('nonexistent')).toBeNull();
  });

  it('stores and retrieves a session', async () => {
    const session = makeSession();
    await cache.set(session, 300);

    const retrieved = await cache.get('sess_1');
    expect(retrieved).toEqual(session);
  });

  it('deletes a session', async () => {
    await cache.set(makeSession(), 300);
    await cache.delete('sess_1');
    expect(await cache.get('sess_1')).toBeNull();
  });

  it('expires entries after TTL', async () => {
    await cache.set(makeSession(), 0);
    await new Promise((r) => setTimeout(r, 10));
    expect(await cache.get('sess_1')).toBeNull();
  });

  it('clear() removes all entries', async () => {
    await cache.set(makeSession('sess_1'), 300);
    await cache.set(makeSession('sess_2'), 300);
    cache.clear();
    expect(await cache.get('sess_1')).toBeNull();
    expect(await cache.get('sess_2')).toBeNull();
  });

  it('overwrites existing entry with new TTL', async () => {
    const session = makeSession();
    await cache.set(session, 0);
    await cache.set(session, 300);
    await new Promise((r) => setTimeout(r, 10));
    expect(await cache.get('sess_1')).toEqual(session);
  });
});
