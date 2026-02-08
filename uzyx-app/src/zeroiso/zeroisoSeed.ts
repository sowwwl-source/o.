function normalizeText(input: string): string {
  return String(input || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function looksLikePrivateKey(s: string): boolean {
  const t = s.toLowerCase();
  return t.includes("begin openssh private key") || t.includes("begin rsa private key") || t.includes("begin private key");
}

function toUtf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  const cryptoObj: Crypto | undefined = (globalThis as any).crypto;
  if (!cryptoObj?.subtle) throw new Error("crypto.subtle unavailable");
  const digest = await cryptoObj.subtle.digest("SHA-256", data as unknown as BufferSource);
  return new Uint8Array(digest);
}

const B32 = "abcdefghijklmnopqrstuvwxyz234567";
const CROCK32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function base32(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let val = 0;
  for (let i = 0; i < bytes.length; i++) {
    val = (val << 8) | bytes[i]!;
    bits += 8;
    while (bits >= 5) {
      const idx = (val >>> (bits - 5)) & 31;
      out += B32[idx]!;
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31]!;
  return out;
}

function base32Crockford(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let val = 0;
  for (let i = 0; i < bytes.length; i++) {
    val = (val << 8) | bytes[i]!;
    bits += 8;
    while (bits >= 5) {
      const idx = (val >>> (bits - 5)) & 31;
      out += CROCK32[idx]!;
      bits -= 5;
    }
  }
  if (bits > 0) out += CROCK32[(val << (5 - bits)) & 31]!;
  return out;
}

export function normalizeHandle(handle: string): string {
  const h = normalizeText(handle).replace(/^@+/, "");
  return h.replace(/[^a-z0-9._-]/gi, "").slice(0, 32) || "anon";
}

export async function seedFromHandle(handle: string, nowMs = Date.now()): Promise<string> {
  const h = normalizeHandle(handle);
  const payload = `${h}:${Math.floor(nowMs / 1000)}`;
  const bytes = await sha256Bytes(toUtf8Bytes(payload));
  return base32(bytes).slice(0, 16);
}

export function normalizeSshPubkey(pub: string): string {
  // keep it strict: trim, collapse spaces, keep first 2 fields
  const line = normalizeText(pub).split("\n")[0] ?? "";
  const parts = line.trim().split(/\s+/);
  return parts.slice(0, 2).join(" ");
}

export async function principalIdFromSshPubkey(pub: string): Promise<string> {
  const t = normalizeText(pub);
  if (!t) throw new Error("empty key");
  if (looksLikePrivateKey(t)) throw new Error("private keys are not allowed");

  const normalized = normalizeSshPubkey(t);
  const parts = normalized.split(/\s+/g).filter(Boolean);
  if (parts.length < 2) throw new Error("Clé publique SSH invalide (format).");

  const keyType = parts[0]!;
  const payload = parts[1]!;
  if (!keyType.startsWith("ssh-") && !keyType.startsWith("sk-ssh-")) throw new Error("Clé publique SSH invalide (format).");
  if (!/^[a-z0-9+/=]+$/i.test(payload) || payload.length < 16) throw new Error("Clé publique SSH invalide (format).");

  const digest = await sha256Bytes(toUtf8Bytes(normalized));
  return base32Crockford(digest).slice(0, 28);
}

export function cloudNamespace(principalId: string): string {
  return `soul.cloud/u/${principalId}`;
}

export function zeroisoSeed(principalId: string, version = "v1"): string {
  return `0iso:${principalId}:${version}`;
}

export function assertPublicOnlySeed(seed: string): void {
  const t = normalizeText(seed);
  if (!t) return;
  if (looksLikePrivateKey(t) || t.toLowerCase().includes("private key")) throw new Error("O. RULE: jamais de secret dans la seed.");
}

export async function seedFromSshPublicKey(pubkeyText: string): Promise<string> {
  const pid = await principalIdFromSshPubkey(pubkeyText);
  const seed = zeroisoSeed(pid, "v1");
  assertPublicOnlySeed(seed);
  return seed;
}
