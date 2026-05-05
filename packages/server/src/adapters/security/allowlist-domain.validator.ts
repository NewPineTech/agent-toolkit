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

    return allowedDomains.some((domain) => {
      const normalizedDomain = domain.toLowerCase().replace(/\/$/, "");

      if (normalizedDomain.startsWith("*.")) {
        const suffix = normalizedDomain.slice(1);
        return (
          normalizedOrigin.endsWith(suffix) ||
          normalizedOrigin === `https://${normalizedDomain.slice(2)}` ||
          normalizedOrigin === `http://${normalizedDomain.slice(2)}`
        );
      }

      return normalizedOrigin === normalizedDomain;
    });
  }
}
