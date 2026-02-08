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

export async function seedFromSshPublicKey(pubkeyText: string): Promise<string> {
  const t = normalizeText(pubkeyText);
  if (!t) throw new Error("empty key");
  if (looksLikePrivateKey(t)) throw new Error("private keys are not allowed");

  // Accept: "ssh-ed25519 AAAA... comment"
  // Normalize to the first 2-3 tokens (type + base64 + optional comment hash).
  const parts = t.split(/\s+/g).filter(Boolean);
  if (parts.length < 2) throw new Error("invalid public key");
  const normalized = `${parts[0]} ${parts[1]}`;
  const bytes = await sha256Bytes(toUtf8Bytes(normalized));
  return base32(bytes).slice(0, 20);
}
