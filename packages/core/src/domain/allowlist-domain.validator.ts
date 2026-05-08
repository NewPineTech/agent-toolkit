import type { Workspace } from "@agent-toolkit/types";

export type AllowedDomains = Workspace["allowedDomains"];

export interface DomainValidator {
  /** Validate that the given origin is allowed for the workspace's domain list. */
  validate(
    origin: string | null | undefined,
    allowedDomains: AllowedDomains,
  ): boolean;
}

export class AllowlistDomainValidator implements DomainValidator {
  constructor(private readonly isDevelopment: boolean = false) {}

  validate(
    origin: string | null | undefined,
    allowedDomains: AllowedDomains,
  ): boolean {
    if (this.isDevelopment) return true;
    if (!origin) return false;
    if (allowedDomains.length === 0) return false;

    const normalizedOrigin = origin.toLowerCase().replace(/\/$/, "");

    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(normalizedOrigin);
    } catch {
      return false;
    }

    return allowedDomains.some((domain) => {
      const normalizedDomain = domain.toLowerCase().replace(/\/$/, "");

      if (normalizedDomain === "*") return true;

      if (normalizedDomain.startsWith("*.")) {
        const wildcardHost = normalizedDomain.slice(2);
        const originHost = parsedOrigin.hostname;
        return (
          originHost === wildcardHost || originHost.endsWith(`.${wildcardHost}`)
        );
      }

      return normalizedOrigin === normalizedDomain;
    });
  }
}
