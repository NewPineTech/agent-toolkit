const LOCAL_ADMIN_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export interface LocalAdminDevRuntime {
  allowed: boolean;
  reason?: string;
}

export function validateLocalAdminDevRuntime(
  mode: string,
  hostname: string,
): LocalAdminDevRuntime {
  if (mode !== "development") {
    return {
      allowed: false,
      reason: "Admin Inspector UI is local-development only.",
    };
  }

  if (!isLocalAdminHost(hostname)) {
    return {
      allowed: false,
      reason: "Admin Inspector UI only runs on localhost or 127.0.0.1.",
    };
  }

  return { allowed: true };
}

export function isLocalAdminHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return LOCAL_ADMIN_HOSTS.has(normalized) || normalized.endsWith(".localhost");
}
