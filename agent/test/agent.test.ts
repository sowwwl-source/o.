import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { decryptTextLocal, encryptTextLocal, ensureAgeIdentity } from "../src/age.js";
import { configureFromEnvIfMissing, loadConfig } from "../src/config.js";
import { ensureSshKeypair } from "../src/ssh.js";
import { ageIdentityPath, configPath, sshPrivAgePath, sshPubPath, tokenSecretAgePath } from "../src/paths.js";

async function tmpHome(): Promise<string> {
  return await fs.promises.mkdtemp(path.join(os.tmpdir(), "o-agent-test-"));
}

describe("o-agent", () => {
  beforeEach(async () => {
    process.env.O_AGENT_HOME = await tmpHome();
    delete process.env.O_AGENT_BACKEND_URL;
    delete process.env.O_AGENT_TOKEN_ID;
    delete process.env.O_AGENT_TOKEN_SECRET;
  });

  it("age encrypt/decrypt roundtrip (local identity)", async () => {
    const id = await ensureAgeIdentity();
    expect(id).toMatch(/^AGE-SECRET-KEY-/);
    expect(fs.existsSync(ageIdentityPath())).toBe(true);

    const c = await encryptTextLocal("hello");
    expect(c).toContain("BEGIN AGE ENCRYPTED FILE");
    const p = await decryptTextLocal(c);
    expect(p).toBe("hello");
  });

  it("config persists token secret encrypted (never plaintext)", async () => {
    process.env.O_AGENT_BACKEND_URL = "http://127.0.0.1:8787";
    process.env.O_AGENT_TOKEN_ID = "token-123";
    process.env.O_AGENT_TOKEN_SECRET = "supersecret";

    const wrote = await configureFromEnvIfMissing();
    expect(wrote).toBe(true);
    expect(fs.existsSync(configPath())).toBe(true);
    expect(fs.existsSync(tokenSecretAgePath())).toBe(true);

    const rawSecret = await fs.promises.readFile(tokenSecretAgePath(), "utf8");
    expect(rawSecret).toContain("BEGIN AGE ENCRYPTED FILE");
    expect(rawSecret).not.toContain("supersecret");

    const loaded = await loadConfig();
    expect(loaded?.config.backendUrl).toBe("http://127.0.0.1:8787");
    expect(loaded?.config.tokenId).toBe("token-123");
    expect(loaded?.secrets.tokenSecret).toBe("supersecret");
  });

  it("ssh private key is stored age-encrypted at rest", async () => {
    const { publicKey } = await ensureSshKeypair();
    expect(publicKey).toMatch(/^ssh-ed25519 /);

    expect(fs.existsSync(sshPubPath())).toBe(true);
    expect(fs.existsSync(sshPrivAgePath())).toBe(true);

    const privArmored = await fs.promises.readFile(sshPrivAgePath(), "utf8");
    expect(privArmored).toContain("BEGIN AGE ENCRYPTED FILE");
    expect(privArmored).not.toContain("BEGIN OPENSSH PRIVATE KEY");
  });
});

