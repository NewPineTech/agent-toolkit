import type { DomainValidator } from "../../interfaces/domain-validator.interface.js";

export class AllowlistDomainValidator implements DomainValidator {
  constructor(private readonly isDevelopment: boolean = false) {}

  validate(
    origin: string | null | undefined,
    allowedDomains: string[],
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

      if (normalizedDomain.startsWith("*.")) {
        const wildcardHost = normalizedDomain.slice(2);
        const originHost = parsedOrigin.hostname;
        return (
          originHost === wildcardHost || originHost.endsWith(`.${wildcardHost}`)
        );
      }

      // Exact match requires full origin (scheme + host + port)
      return normalizedOrigin === normalizedDomain;
    });
  }
}
