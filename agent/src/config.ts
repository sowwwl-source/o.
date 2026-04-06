import fs from "node:fs";
import path from "node:path";
import { configPath, tokenSecretAgePath } from "./paths.js";
import { decryptTextLocal, encryptTextLocal } from "./age.js";

export type AgentConfig = {
  backendUrl: string;
  tokenId: string;
};

export type AgentSecrets = {
  tokenSecret: string;
};

function cleanUrl(u: string): string {
  const s = u.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(s)) throw new Error("backendUrl must start with http(s)://");
  // Reject plain http:// for non-localhost targets (SEC-006).
  if (/^http:\/\//i.test(s)) {
    let host: string;
    try {
      host = new URL(s).hostname;
    } catch {
      throw new Error("backendUrl is not a valid URL");
    }
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
      throw new Error("backendUrl must use https:// for non-localhost targets");
    }
  }
  return s;
}

function cleanTokenId(id: string): string {
  const s = id.trim();
  if (!s || s.length > 200) throw new Error("tokenId invalid");
  return s;
}

export async function loadConfig(): Promise<{ config: AgentConfig; secrets: AgentSecrets } | null> {
  try {
    const raw = await fs.promises.readFile(configPath(), "utf8");
    const cfg = JSON.parse(raw) as Partial<AgentConfig>;
    if (!cfg.backendUrl || !cfg.tokenId) return null;

    const secretArmored = await fs.promises.readFile(tokenSecretAgePath(), "utf8");
    const tokenSecret = (await decryptTextLocal(secretArmored)).trim();
    if (!tokenSecret) return null;
    return { config: { backendUrl: String(cfg.backendUrl), tokenId: String(cfg.tokenId) }, secrets: { tokenSecret } };
  } catch {
    return null;
  }
}

export async function configureFromEnvIfMissing(): Promise<boolean> {
  const exists = await loadConfig();
  if (exists) return false;

  const backendUrl = process.env.O_AGENT_BACKEND_URL ? cleanUrl(process.env.O_AGENT_BACKEND_URL) : "";
  const tokenId = process.env.O_AGENT_TOKEN_ID ? cleanTokenId(process.env.O_AGENT_TOKEN_ID) : "";
  const tokenSecret = process.env.O_AGENT_TOKEN_SECRET ? process.env.O_AGENT_TOKEN_SECRET.trim() : "";

  if (!backendUrl || !tokenId || !tokenSecret) return false;

  await fs.promises.mkdir(path.dirname(configPath()), { recursive: true, mode: 0o700 });
  await fs.promises.writeFile(configPath(), JSON.stringify({ backendUrl, tokenId }, null, 2) + "\n", { mode: 0o600 });
  const armored = await encryptTextLocal(tokenSecret);
  await fs.promises.writeFile(tokenSecretAgePath(), armored + "\n", { mode: 0o600 });
  return true;
}

export async function wipeConfig(): Promise<void> {
  await fs.promises.rm(configPath(), { force: true });
  await fs.promises.rm(tokenSecretAgePath(), { force: true });
}

