export type DomainEnv = {
  host: string;
  requireSshPrincipal: boolean;
};

export function getDomainEnv(): DomainEnv {
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const requireSshPrincipal = host.endsWith("sowwwl.cloud");
  return { host, requireSshPrincipal };
}

