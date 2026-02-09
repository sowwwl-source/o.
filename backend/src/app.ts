import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import type { Config } from "./config.js";
import type { Store } from "./db.js";
import { getBearer, getRequestId } from "./http.js";
import { hashTokenSecret, randomTokenSecret, safeEqualString } from "./crypto.js";
import { signUserCertificate, writeKrl } from "./ssh/ca.js";
import { isLikelySshPublicKey } from "./validation.js";

export function createApp(config: Config, store: Store) {
  const caPublicKey = fs.readFileSync(config.caPublicKeyPath, "utf8").trim();

  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "128kb" }));
  app.use(
    morgan("tiny", {
      stream: {
        write: (line) => process.stdout.write(line),
      },
    }),
  );

  function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
    const t = getBearer(req);
    if (!t || !safeEqualString(t, config.adminApiToken)) return res.status(401).json({ ok: false });
    return next();
  }

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  // --- Admin provisioning ---
  app.get("/families", requireAdmin, (_req, res) => {
    const families = store.listFamilies().map((f) => ({
      id: f.id,
      label: f.label,
      principals: JSON.parse(f.principals_json) as string[],
      createdAt: f.created_at,
    }));
    res.json({ ok: true, families });
  });

  app.post("/families", requireAdmin, (req, res) => {
    const label = String(req.body?.label ?? "").trim();
    const principals = Array.isArray(req.body?.principals) ? (req.body.principals as unknown[]) : [];
    const cleaned = principals.map((p) => String(p).trim()).filter(Boolean);
    if (!label || !cleaned.length) return res.status(400).json({ ok: false, error: "invalid_input" });

    const id = randomUUID();
    store.createFamily({ id, label, principals: cleaned, createdAt: Date.now() });
    res.json({ ok: true, family: { id, label, principals: cleaned } });
  });

  app.get("/tokens", requireAdmin, (_req, res) => {
    const tokens = store.listTokens().map((t) => ({
      id: t.id,
      familyId: t.family_id,
      label: t.label,
      createdAt: t.created_at,
      rotatedAt: t.rotated_at,
      revokedAt: t.revoked_at,
    }));
    res.json({ ok: true, tokens });
  });

  app.post("/families/:id/tokens", requireAdmin, (req, res) => {
    const familyId = String(req.params.id);
    const family = store.getFamily(familyId);
    if (!family) return res.status(404).json({ ok: false, error: "not_found" });

    const tokenId = randomUUID();
    const secret = randomTokenSecret();
    const secretHash = hashTokenSecret(secret, config.tokenHashSecret);
    const label = req.body?.label ? String(req.body.label).trim() : null;

    store.createToken({ id: tokenId, familyId, label, secretHash, createdAt: Date.now() });

    res.json({
      ok: true,
      token: {
        id: tokenId,
        familyId,
        label,
        secret,
      },
    });
  });

  // --- Required endpoints ---

  app.post("/tokens/:id/issue-cert", async (req, res) => {
    const reqId = getRequestId(req);
    try {
      const tokenId = String(req.params.id);
      const secret = getBearer(req);
      if (!secret) return res.status(401).json({ ok: false, error: "unauthorized" });

      const token = store.getToken(tokenId);
      if (!token || token.revoked_at) return res.status(403).json({ ok: false, error: "revoked" });
      const expected = token.secret_hash;
      const actual = hashTokenSecret(secret, config.tokenHashSecret);
      if (!safeEqualString(actual, expected)) return res.status(403).json({ ok: false, error: "revoked" });

      const family = store.getFamily(token.family_id);
      if (!family) return res.status(403).json({ ok: false, error: "revoked" });
      const principals = JSON.parse(family.principals_json) as string[];

      const publicKey = String(req.body?.publicKey ?? "");
      if (!publicKey || !isLikelySshPublicKey(publicKey)) {
        return res.status(400).json({ ok: false, error: "invalid_public_key" });
      }

      const serial = store.nextCertSerial();
      const sign = await signUserCertificate({
        caKeyPath: config.caKeyPath,
        publicKey,
        principals,
        keyId: tokenId,
        ttlMinutes: config.certTtlMinutes,
        serial,
      });

      store.recordIssuance({
        tokenId,
        issuedAt: Date.now(),
        publicKeyFingerprint: sign.publicKeyFingerprint,
        certSerial: serial,
        principals,
        validUntil: sign.validUntil,
      });

      res.json({
        ok: true,
        certificate: sign.certificate,
        caPublicKey,
        principals,
        validUntil: sign.validUntil,
        requestId: reqId,
      });
    } catch (err) {
      console.error({ err, requestId: reqId });
      res.status(500).json({ ok: false, error: "internal", requestId: reqId });
    }
  });

  app.post("/tokens/:id/revoke", requireAdmin, async (req, res) => {
    const tokenId = String(req.params.id);
    const ok = store.revokeToken(tokenId, Date.now());
    if (!ok) return res.status(404).json({ ok: false, error: "not_found_or_already_revoked" });

    if (config.krlPath) {
      const revokedIds = store.listRevokedTokenIds();
      await writeKrl({
        caPublicKeyPath: config.caPublicKeyPath,
        specPath: config.krlSpecPath,
        outPath: config.krlPath,
        revokedKeyIds: revokedIds,
      });
    }

    res.json({ ok: true });
  });

  app.post("/tokens/:id/rotate", requireAdmin, (req, res) => {
    const tokenId = String(req.params.id);
    const token = store.getToken(tokenId);
    if (!token || token.revoked_at) return res.status(404).json({ ok: false, error: "not_found" });

    const secret = randomTokenSecret();
    const secretHash = hashTokenSecret(secret, config.tokenHashSecret);
    store.updateTokenSecretHash(tokenId, secretHash, Date.now());

    res.json({ ok: true, token: { id: tokenId, secret } });
  });

  app.get("/krl", requireAdmin, (req, res) => {
    if (!config.krlPath) return res.status(404).json({ ok: false });
    const p = path.resolve(config.krlPath);
    if (!fs.existsSync(p)) return res.status(404).json({ ok: false });
    res.setHeader("Content-Type", "application/octet-stream");
    res.send(fs.readFileSync(p));
  });

  return app;
}

