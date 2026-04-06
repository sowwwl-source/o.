import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { ensureSshKeypair } from "../ssh.js";
import { agentHome, caPubPath, sshCertPath } from "../paths.js";

export async function startLocalUiServer(opts: { port?: number }) {
  const app = express();

  const here = path.dirname(fileURLToPath(import.meta.url));
  const uiDir = path.resolve(path.join(here, "../../ui"));

  app.get("/api/status", async (_req, res) => {
    const cfg = await loadConfig();
    const hasConfig = !!cfg;
    const tokenId = cfg?.config.tokenId ?? null;
    const backendUrl = cfg?.config.backendUrl ?? null;

    let hasKey = false;
    try {
      await ensureSshKeypair();
      hasKey = true;
    } catch {}

    const hasCert = fs.existsSync(sshCertPath());
    const hasCa = fs.existsSync(caPubPath());

    res.json({
      ok: true,
      hasConfig,
      tokenId,
      backendUrl,
      hasKey,
      hasCert,
      hasCa,
      home: agentHome(),
    });
  });

  app.use(express.static(uiDir, { index: "index.html" }));

  const port = opts.port ?? 0;
  const server = app.listen(port, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;
  return { server, port: actualPort as number };
}
