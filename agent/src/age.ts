import fs from "node:fs";
import path from "node:path";
import * as age from "age-encryption";
import { ageIdentityPath } from "./paths.js";

export type AgeIdentity = string;

export async function ensureAgeIdentity(): Promise<AgeIdentity> {
  const p = ageIdentityPath();
  try {
    const existing = await fs.promises.readFile(p, "utf8");
    if (existing.trim().startsWith("AGE-SECRET-KEY-")) return existing.trim();
  } catch {}

  await fs.promises.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
  const identity = await age.generateIdentity();
  await fs.promises.writeFile(p, identity + "\n", { mode: 0o600 });
  return identity;
}

export async function encryptTextLocal(plaintext: string): Promise<string> {
  const identity = await ensureAgeIdentity();
  const recipient = await age.identityToRecipient(identity);
  const e = new age.Encrypter();
  e.addRecipient(recipient);
  const ciphertext = await e.encrypt(plaintext);
  return age.armor.encode(ciphertext);
}

export async function decryptTextLocal(armoredCiphertext: string): Promise<string> {
  const identity = await ensureAgeIdentity();
  const d = new age.Decrypter();
  d.addIdentity(identity);
  const decoded = age.armor.decode(armoredCiphertext);
  return await d.decrypt(decoded, "text");
}

