export interface DomainValidator {
  /** Validate that the given origin is allowed for the workspace's domain list. */
  validate(
    origin: string | null | undefined,
    allowedDomains: string[],
  ): boolean;
}
