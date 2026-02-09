import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type FamilyRow = {
  id: string;
  label: string;
  principals_json: string;
  created_at: number;
};

export type TokenRow = {
  id: string;
  family_id: string;
  label: string | null;
  secret_hash: string;
  created_at: number;
  rotated_at: number | null;
  revoked_at: number | null;
};

export type IssuanceRow = {
  id: number;
  token_id: string;
  issued_at: number;
  public_key_fingerprint: string;
  cert_serial: number;
  principals_json: string;
  valid_until: number;
};

export type Store = ReturnType<typeof createStore>;

export function createStore(dbPath: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS families (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      principals_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      label TEXT,
      secret_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      rotated_at INTEGER,
      revoked_at INTEGER,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cert_serials (
      id INTEGER PRIMARY KEY AUTOINCREMENT
    );

    CREATE TABLE IF NOT EXISTS issuances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id TEXT NOT NULL,
      issued_at INTEGER NOT NULL,
      public_key_fingerprint TEXT NOT NULL,
      cert_serial INTEGER NOT NULL,
      principals_json TEXT NOT NULL,
      valid_until INTEGER NOT NULL,
      FOREIGN KEY (token_id) REFERENCES tokens(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tokens_family ON tokens(family_id);
    CREATE INDEX IF NOT EXISTS idx_tokens_revoked ON tokens(revoked_at);
    CREATE INDEX IF NOT EXISTS idx_issuances_token ON issuances(token_id);
  `);

  const createFamilyStmt = db.prepare(
    `INSERT INTO families (id, label, principals_json, created_at) VALUES (@id, @label, @principals_json, @created_at)`,
  );
  const listFamiliesStmt = db.prepare(`SELECT * FROM families ORDER BY created_at DESC`);
  const getFamilyStmt = db.prepare(`SELECT * FROM families WHERE id = ?`);

  const createTokenStmt = db.prepare(
    `INSERT INTO tokens (id, family_id, label, secret_hash, created_at) VALUES (@id, @family_id, @label, @secret_hash, @created_at)`,
  );
  const listTokensStmt = db.prepare(`SELECT * FROM tokens ORDER BY created_at DESC`);
  const getTokenStmt = db.prepare(`SELECT * FROM tokens WHERE id = ?`);
  const updateTokenHashStmt = db.prepare(`UPDATE tokens SET secret_hash = ?, rotated_at = ? WHERE id = ?`);
  const revokeTokenStmt = db.prepare(`UPDATE tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`);

  const recordIssuanceStmt = db.prepare(
    `INSERT INTO issuances (token_id, issued_at, public_key_fingerprint, cert_serial, principals_json, valid_until)
     VALUES (@token_id, @issued_at, @public_key_fingerprint, @cert_serial, @principals_json, @valid_until)`,
  );

  const listRevokedTokenIdsStmt = db.prepare(
    `SELECT id FROM tokens WHERE revoked_at IS NOT NULL ORDER BY revoked_at ASC`,
  );

  return {
    db,
    createFamily(row: { id: string; label: string; principals: string[]; createdAt: number }) {
      createFamilyStmt.run({
        id: row.id,
        label: row.label,
        principals_json: JSON.stringify(row.principals),
        created_at: row.createdAt,
      });
    },
    listFamilies(): FamilyRow[] {
      return listFamiliesStmt.all() as FamilyRow[];
    },
    getFamily(id: string): FamilyRow | undefined {
      return getFamilyStmt.get(id) as FamilyRow | undefined;
    },
    createToken(row: {
      id: string;
      familyId: string;
      label: string | null;
      secretHash: string;
      createdAt: number;
    }) {
      createTokenStmt.run({
        id: row.id,
        family_id: row.familyId,
        label: row.label,
        secret_hash: row.secretHash,
        created_at: row.createdAt,
      });
    },
    listTokens(): TokenRow[] {
      return listTokensStmt.all() as TokenRow[];
    },
    getToken(id: string): TokenRow | undefined {
      return getTokenStmt.get(id) as TokenRow | undefined;
    },
    updateTokenSecretHash(id: string, secretHash: string, rotatedAt: number) {
      updateTokenHashStmt.run(secretHash, rotatedAt, id);
    },
    revokeToken(id: string, revokedAt: number): boolean {
      const info = revokeTokenStmt.run(revokedAt, id);
      return info.changes === 1;
    },
    recordIssuance(row: {
      tokenId: string;
      issuedAt: number;
      publicKeyFingerprint: string;
      certSerial: number;
      principals: string[];
      validUntil: number;
    }) {
      recordIssuanceStmt.run({
        token_id: row.tokenId,
        issued_at: row.issuedAt,
        public_key_fingerprint: row.publicKeyFingerprint,
        cert_serial: row.certSerial,
        principals_json: JSON.stringify(row.principals),
        valid_until: row.validUntil,
      });
    },
    nextCertSerial(): number {
      const r = db.prepare(`INSERT INTO cert_serials DEFAULT VALUES`).run();
      return Number(r.lastInsertRowid);
    },
    listRevokedTokenIds(): string[] {
      const rows = listRevokedTokenIdsStmt.all() as Array<{ id: string }>;
      return rows.map((r) => r.id);
    },
  };
}
