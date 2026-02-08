const LS_KEY = "0iso:principal_id";

function normalize(pid: string): string {
  return String(pid || "").trim().toUpperCase();
}

export function loadPrincipalId(): string | null {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (!v) return null;
    const pid = normalize(v);
    if (!/^[0-9A-HJKMNPQRSTVWXYZ]{28}$/.test(pid)) return null;
    return pid;
  } catch {
    return null;
  }
}

export function savePrincipalId(pid: string): void {
  try {
    localStorage.setItem(LS_KEY, normalize(pid));
  } catch {}
}

export function clearPrincipalId(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
}

