import type { UsageRecord } from '@agent-toolkit/types';

export interface UsageTracker {
  /** Increment message count for a workspace on a given date. */
  increment(workspaceId: string, date: string): Promise<void>;

  /** Query usage records for a workspace within a date range (inclusive). */
  getUsage(
    workspaceId: string,
    from: string,
    to: string,
  ): Promise<UsageRecord[]>;
}
