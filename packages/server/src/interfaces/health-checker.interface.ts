import type { ComponentHealth } from '@agent-toolkit/types';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  components: Record<string, ComponentHealth>;
}

export interface HealthChecker {
  /** Run all health checks and return aggregate status. */
  check(): Promise<HealthStatus>;
}
