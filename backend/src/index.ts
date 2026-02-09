import fs from "node:fs";
import { loadConfig } from "./config.js";
import { createStore } from "./db.js";
import { createApp } from "./app.js";
import { writeKrl } from "./ssh/ca.js";

const config = loadConfig();
const store = createStore(config.dbPath);

if (!fs.existsSync(config.caKeyPath)) throw new Error(`CA private key not found: ${config.caKeyPath}`);
if (!fs.existsSync(config.caPublicKeyPath)) throw new Error(`CA public key not found: ${config.caPublicKeyPath}`);

const app = createApp(config, store);

if (config.krlPath) {
  const revokedIds = store.listRevokedTokenIds();
  await writeKrl({
    caPublicKeyPath: config.caPublicKeyPath,
    specPath: config.krlSpecPath,
    outPath: config.krlPath,
    revokedKeyIds: revokedIds,
  });
}

app.listen(config.port, () => {
  console.log(`[o-sshca-backend] listening on :${config.port}`);
});
