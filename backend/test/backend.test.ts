import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";
import type { Config } from "../src/config.js";
import { createStore } from "../src/db.js";
import { createApp } from "../src/app.js";

function run(cmd: string, args: string[], cwd: string) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  return r;
}

describe("o-sshca-backend", () => {
  let tmp: string;
  let config: Config;
  let request: supertest.SuperTest<supertest.Test>;

  beforeAll(async () => {
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "o-sshca-backend-"));

    const caDir = path.join(tmp, "ca");
    await fs.promises.mkdir(caDir, { recursive: true });
    const caKey = path.join(caDir, "o_ca");
    run("ssh-keygen", ["-t", "ed25519", "-f", caKey, "-N", "", "-C", "o-test-ca"], tmp);

    config = {
      port: 8787,
      dbPath: path.join(tmp, "db.sqlite"),
      adminApiToken: "admin_test_secret",
      tokenHashSecret: "hash_secret_test",
      caKeyPath: caKey,
      caPublicKeyPath: caKey + ".pub",
      certTtlMinutes: 1,
      krlPath: path.join(tmp, "revoked.krl"),
      krlSpecPath: path.join(tmp, "revoked.krl-spec"),
    };

    const store = createStore(config.dbPath);
    const app = createApp(config, store);
    request = supertest(app);
  });

  it("provisions token, issues cert, rotates, revokes + generates KRL", async () => {
    const adminAuth = { Authorization: `Bearer ${config.adminApiToken}` };

    const familyRes = await request
      .post("/families")
      .set(adminAuth)
      .send({ label: "prod", principals: ["o"] })
      .expect(200);
    expect(familyRes.body.ok).toBe(true);
    const familyId = String(familyRes.body.family.id);

    const tokenRes = await request
      .post(`/families/${familyId}/tokens`)
      .set(adminAuth)
      .send({ label: "laptop" })
      .expect(200);
    expect(tokenRes.body.ok).toBe(true);
    const tokenId = String(tokenRes.body.token.id);
    const tokenSecret = String(tokenRes.body.token.secret);
    expect(tokenSecret.length).toBeGreaterThan(20);

    const userDir = path.join(tmp, "user");
    await fs.promises.mkdir(userDir, { recursive: true });
    const userKey = path.join(userDir, "id_ed25519");
    run("ssh-keygen", ["-t", "ed25519", "-f", userKey, "-N", "", "-C", "o-user"], tmp);
    const publicKey = await fs.promises.readFile(userKey + ".pub", "utf8");

    const issue1 = await request
      .post(`/tokens/${tokenId}/issue-cert`)
      .set({ Authorization: `Bearer ${tokenSecret}` })
      .send({ publicKey })
      .expect(200);
    expect(issue1.body.ok).toBe(true);
    expect(issue1.body.certificate).toMatch(/-cert-v01@openssh\.com/);

    const cert1Path = path.join(userDir, "cert1.pub");
    await fs.promises.writeFile(cert1Path, issue1.body.certificate + "\n", { mode: 0o600 });
    const certInfo = run("ssh-keygen", ["-L", "-f", cert1Path], tmp);
    expect(certInfo.stdout).toContain(`Key ID: "${tokenId}"`);
    expect(certInfo.stdout).toContain("Principals:");
    expect(certInfo.stdout).toContain("o");

    const rotate = await request.post(`/tokens/${tokenId}/rotate`).set(adminAuth).send({}).expect(200);
    const newSecret = String(rotate.body.token.secret);
    expect(newSecret).not.toBe(tokenSecret);

    await request
      .post(`/tokens/${tokenId}/issue-cert`)
      .set({ Authorization: `Bearer ${tokenSecret}` })
      .send({ publicKey })
      .expect(403);

    await request
      .post(`/tokens/${tokenId}/issue-cert`)
      .set({ Authorization: `Bearer ${newSecret}` })
      .send({ publicKey })
      .expect(200);

    await request.post(`/tokens/${tokenId}/revoke`).set(adminAuth).send({}).expect(200);

    await request
      .post(`/tokens/${tokenId}/issue-cert`)
      .set({ Authorization: `Bearer ${newSecret}` })
      .send({ publicKey })
      .expect(403);

    expect(fs.existsSync(config.krlPath!)).toBe(true);

    // The certificate issued before revocation should now match the KRL by Key ID.
    const q = spawnSync("ssh-keygen", ["-Q", "-f", config.krlPath!, cert1Path], { encoding: "utf8" });
    expect(q.status).not.toBe(0);
  });
});

