import path from "node:path";

export type Config = {
  port: number;
  dbPath: string;
  adminApiToken: string;
  tokenHashSecret: string;
  caKeyPath: string;
  caPublicKeyPath: string;
  certTtlMinutes: number;
  krlPath?: string;
  krlSpecPath: string;
};

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export function loadConfig(): Config {
  const port = clampInt(Number(process.env.PORT ?? "8787"), 1, 65535);
  const dbPath = process.env.O_DB_PATH
    ? path.resolve(process.env.O_DB_PATH)
    : path.resolve("data", "o-sshca.sqlite");

  const adminApiToken = requiredEnv("O_ADMIN_API_TOKEN");
  const tokenHashSecret = requiredEnv("O_TOKEN_HASH_SECRET");

  const caKeyPath = path.resolve(requiredEnv("O_CA_KEY_PATH"));
  const caPublicKeyPath = path.resolve(requiredEnv("O_CA_PUB_PATH"));

  const certTtlMinutes = clampInt(Number(process.env.O_CERT_TTL_MINUTES ?? "5"), 1, 30);

  const krlPath = process.env.O_KRL_PATH ? path.resolve(process.env.O_KRL_PATH) : undefined;
  const krlSpecPath = process.env.O_KRL_SPEC_PATH
    ? path.resolve(process.env.O_KRL_SPEC_PATH)
    : path.resolve("data", "revoked.krl-spec");

  return {
    port,
    dbPath,
    adminApiToken,
    tokenHashSecret,
    caKeyPath,
    caPublicKeyPath,
    certTtlMinutes,
    krlPath,
    krlSpecPath,
  };
}

