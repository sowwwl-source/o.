#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { configureFromEnvIfMissing, loadConfig, wipeConfig } from "./config.js";
import { decryptSshPrivateKeyToTempFile, ensureSshKeypair } from "./ssh.js";
import { issueCert } from "./backend.js";
import { agentHome, caPubPath, sshCertPath } from "./paths.js";
import { startLocalUiServer } from "./ui/server.js";
import { openBrowser } from "./open.js";
import { spawnSync } from "node:child_process";

const program = new Command();
program.name("o-agent").description("Local agent for short-lived SSH certs (OpenSSH CA).");

program
  .command("verify")
  .description("Verify local keystore, request a short-lived cert, and cache it locally.")
  .action(async () => {
    await configureFromEnvIfMissing();
    const loaded = await loadConfig();
    if (!loaded) {
      process.stderr.write(
        [
          "Missing config.",
          "Set these env vars once, then re-run:",
          "  O_AGENT_BACKEND_URL=https://your-backend",
          "  O_AGENT_TOKEN_ID=...",
          "  O_AGENT_TOKEN_SECRET=...",
        ].join("\n") + "\n",
      );
      process.exitCode = 2;
      return;
    }

    const { publicKey } = await ensureSshKeypair();
    const resp = await issueCert({
      backendUrl: loaded.config.backendUrl,
      tokenId: loaded.config.tokenId,
      tokenSecret: loaded.secrets.tokenSecret,
      publicKey,
    });

    await fs.promises.mkdir(path.dirname(sshCertPath()), { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(sshCertPath(), resp.certificate + "\n", { mode: 0o600 });
    await fs.promises.writeFile(caPubPath(), resp.caPublicKey + "\n", { mode: 0o644 });

    // Best-effort: load key+certificate into ssh-agent with a matching lifetime.
    // This avoids ever storing the plaintext private key at rest.
    const ttlSeconds = Math.max(60, Math.floor((resp.validUntil - Date.now()) / 1000));
    if (process.env.SSH_AUTH_SOCK) {
      try {
        const tmp = await decryptSshPrivateKeyToTempFile();
        const certPath = tmp.path + "-cert.pub";
        await fs.promises.writeFile(certPath, resp.certificate + "\n", { mode: 0o600 });

        const add = spawnSync("ssh-add", ["-t", String(ttlSeconds), tmp.path], { encoding: "utf8" });
        await tmp.cleanup();

        if (add.status !== 0) {
          process.stderr.write((add.stderr || add.stdout || "ssh-add failed") + "\n");
        }
      } catch {
        // ignore
      }
    }

    process.stdout.write(
      [
        "ok",
        `tokenId=${loaded.config.tokenId}`,
        `principals=${resp.principals.join(",")}`,
        `validUntil=${new Date(resp.validUntil).toISOString()}`,
      ].join("\n") + "\n",
    );
  });

program
  .command("open")
  .description("Open the local agent UI in a browser.")
  .option("--port <port>", "Port for local UI", (v) => Number(v))
  .action(async (opts) => {
    const { port } = await startLocalUiServer({ port: opts.port });
    const url = `http://127.0.0.1:${port}`;
    process.stdout.write(url + "\n");
    try {
      openBrowser(url);
    } catch {}
  });

program
  .command("lost")
  .description("Wipe local agent secrets and keys on this machine.")
  .action(async () => {
    await wipeConfig();
    await fs.promises.rm(path.dirname(sshCertPath()), { recursive: true, force: true });
    // Also remove the local age identity (so this device cannot decrypt old material).
    // This will be regenerated on next verify/open.
    await fs.promises.rm(agentHome(), { recursive: true, force: true });
    process.stdout.write("ok\n");
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(String(err?.message ?? err) + "\n");
  process.exitCode = 1;
});
