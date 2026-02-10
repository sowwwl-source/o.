type CanonicalOpts = {
  /**
   * Canonical host for the *.sowwwl.cloud UI surface.
   * Defaults to "0.user.o.sowwwl.cloud".
   */
  canonicalCloudHost?: string;
};

function cleanHost(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "")
    .toLowerCase();
}

/**
 * Canonical host enforcement.
 *
 * Why client-side:
 * - Hash routing (/#/...) is not sent to the server/edge, so server redirects lose the route.
 * - This preserves pathname + search + hash.
 */
export function enforceCanonicalHost(opts: CanonicalOpts = {}): boolean {
  if (typeof window === "undefined") return false;

  const host = cleanHost(window.location.hostname);
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1") return false;

  // Only canonicalize within the .cloud surface.
  if (!host.endsWith("sowwwl.cloud")) return false;

  const envHost = cleanHost(import.meta.env.VITE_CANONICAL_HOST);
  const canonical = cleanHost(opts.canonicalCloudHost || envHost || "0.user.o.sowwwl.cloud");
  if (!canonical) return false;
  if (host === canonical) return false;

  const next = `https://${canonical}${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(next);
  return true;
}

