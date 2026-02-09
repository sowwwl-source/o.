import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function randomTokenSecret(bytes = 32): string {
  return base64Url(randomBytes(bytes));
}

export function hashTokenSecret(secret: string, hashSecret: string): string {
  return createHmac("sha256", hashSecret).update(secret, "utf8").digest("base64");
}

export function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

