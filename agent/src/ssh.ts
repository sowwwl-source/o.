import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { decryptTextLocal, encryptTextLocal } from "./age.js";
import { sshPrivAgePath, sshPubPath } from "./paths.js";

function run(cmd: string, args: string[], cwd: string) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  return r;
}

export async function ensureSshKeypair(): Promise<{ publicKey: string }> {
  try {
    const pub = await fs.promises.readFile(sshPubPath(), "utf8");
    const privAge = await fs.promises.readFile(sshPrivAgePath(), "utf8");
    if (pub.trim() && privAge.trim()) return { publicKey: pub.trim() };
  } catch {}

  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "o-agent-ssh-"));
  try {
    const keyPath = path.join(tmp, "id_ed25519");
    run("ssh-keygen", ["-t", "ed25519", "-f", keyPath, "-N", "", "-C", "o-agent"], tmp);
    const priv = await fs.promises.readFile(keyPath, "utf8");
    const pub = await fs.promises.readFile(keyPath + ".pub", "utf8");

    const privArmored = await encryptTextLocal(priv);
    await fs.promises.mkdir(path.dirname(sshPrivAgePath()), { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(sshPrivAgePath(), privArmored + "\n", { mode: 0o600 });
    await fs.promises.writeFile(sshPubPath(), pub.trim() + "\n", { mode: 0o644 });
    return { publicKey: pub.trim() };
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  }
}

export async function decryptSshPrivateKeyToTempFile(): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const armored = await fs.promises.readFile(sshPrivAgePath(), "utf8");
  const priv = await decryptTextLocal(armored);
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "o-agent-key-"));
  const out = path.join(tmp, "id_ed25519");
  await fs.promises.writeFile(out, priv, { mode: 0o600 });
  return {
    path: out,
    cleanup: async () => {
      await fs.promises.rm(tmp, { recursive: true, force: true });
    },
  };
}

