import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileStrict } from "./sshKeygen.js";

export type SignResult = {
  certificate: string;
  publicKeyFingerprint: string;
  validUntil: number;
};

function principalsToArg(principals: string[]): string {
  const cleaned = principals
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.replaceAll(",", "_"));
  if (!cleaned.length) throw new Error("No principals configured for token family.");
  return cleaned.join(",");
}

export async function signUserCertificate(args: {
  caKeyPath: string;
  publicKey: string;
  principals: string[];
  keyId: string;
  ttlMinutes: number;
  serial: number;
}): Promise<SignResult> {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "o-sshca-"));
  try {
    const pubPath = path.join(tmp, "key.pub");
    await fs.promises.writeFile(pubPath, args.publicKey.trim() + "\n", { mode: 0o600 });

    const principalsArg = principalsToArg(args.principals);
    const validity = `+${Math.max(1, Math.min(30, Math.trunc(args.ttlMinutes)))}m`;

    // Secure defaults: no forwarding, no X11.
    await execFileStrict("ssh-keygen", [
      "-s",
      args.caKeyPath,
      "-I",
      args.keyId,
      "-n",
      principalsArg,
      "-V",
      validity,
      "-z",
      String(args.serial),
      "-O",
      "no-port-forwarding",
      "-O",
      "no-agent-forwarding",
      "-O",
      "no-x11-forwarding",
      pubPath,
    ]);

    const certPath = path.join(tmp, "key-cert.pub");
    const certificate = (await fs.promises.readFile(certPath, "utf8")).trim();

    const fpRes = await execFileStrict("ssh-keygen", ["-lf", pubPath]);
    // Example: "256 SHA256:abc... comment (ED25519)"
    const fp = /SHA256:[A-Za-z0-9+/=_-]+/.exec(fpRes.stdout)?.[0] ?? fpRes.stdout.trim();

    return {
      certificate,
      publicKeyFingerprint: fp,
      validUntil: Date.now() + args.ttlMinutes * 60_000,
    };
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  }
}

export async function writeKrl(args: {
  caPublicKeyPath: string;
  specPath: string;
  outPath: string;
  revokedKeyIds: string[];
}): Promise<void> {
  const dir = path.dirname(args.outPath);
  await fs.promises.mkdir(dir, { recursive: true });

  const header = `# generated ${new Date().toISOString()}\n`;
  const lines = args.revokedKeyIds.map((id) => `id: ${id}\n`).join("");
  await fs.promises.writeFile(args.specPath, header + lines, { mode: 0o600 });

  const tmpOut = args.outPath + ".tmp";
  await execFileStrict("ssh-keygen", ["-k", "-f", tmpOut, "-s", args.caPublicKeyPath, args.specPath]);
  await fs.promises.rename(tmpOut, args.outPath);
}

