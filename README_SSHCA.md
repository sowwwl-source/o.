# o-sshca (agent + CA backend + bastion + admin UI)

This is a self-contained system inside this repo:

- `backend/` — Express API that signs **short‑lived OpenSSH user certificates** with an OpenSSH CA.
- `agent/` — Local CLI + local web UI. Stores the SSH private key **encrypted with age** (Mode B).
- `admin/` — Next.js UI to provision / rotate / revoke tokens (Basic Auth).
- `infra/` — Bastion `sshd_config` snippet + scripts.

Security model (acté)
- The server **never** decrypts private keys.
- The bastion accepts **only** CA‑signed certificates (`TrustedUserCAKeys`).
- Tokens authorize certificate issuance. Token secrets are stored server-side **hashed** (HMAC‑SHA256).
- Revoke stops issuance immediately; optional KRL provides immediate session invalidation on bastion.

Operational notes
- Run admin UI + backend behind HTTPS (Basic Auth is plaintext without TLS).
- Keep `O_ADMIN_API_TOKEN` and `O_TOKEN_HASH_SECRET` long/random (server-side only).
- Token secrets are shown once at creation/rotation; store them out-of-band (password manager).

## 1) Generate the OpenSSH CA keypair

```bash
bash infra/scripts/generate-ca.sh
```

Result:
- CA private: `infra/ca/o_ca` (keep server-side only)
- CA public : `infra/ca/o_ca.pub` (copy to bastion)

## 2) Run the backend (CA signer)

```bash
cd backend
npm install
```

Create env:
```bash
export O_ADMIN_API_TOKEN="change-me-admin"
export O_TOKEN_HASH_SECRET="change-me-hash-secret"
export O_CA_KEY_PATH="../infra/ca/o_ca"
export O_CA_PUB_PATH="../infra/ca/o_ca.pub"

# Optional KRL output (for bastion RevokedKeys)
export O_KRL_PATH="../infra/bastion/revoked.krl"
export O_KRL_SPEC_PATH="./data/revoked.krl-spec"

export PORT=8787
npm run dev
```

## 3) Run the admin UI (token provisioning)

```bash
cd admin
npm install
```

```bash
export O_BACKEND_URL="http://127.0.0.1:8787"
export O_ADMIN_API_TOKEN="change-me-admin"
export O_ADMIN_UI_USER="admin"
export O_ADMIN_UI_PASS="change-me-pass"
npm run dev
```

Open: `http://127.0.0.1:3011`

## 4) Configure the bastion (OpenSSH)

Copy CA public key to the bastion:
- `/etc/ssh/o_ca.pub`

Apply `infra/bastion/sshd_config.snippet` to `sshd_config` and reload sshd.

Optional KRL:
- copy `infra/bastion/revoked.krl` to `/etc/ssh/o_revoked.krl`
- enable `RevokedKeys /etc/ssh/o_revoked.krl`

## 5) Configure the local agent

Provision a token in the admin UI:
- create a family with principals (e.g. `o`)
- create a token (copy `tokenId` + `secret`)

Then:
```bash
cd agent
npm install
npm run build
npm link

export O_AGENT_BACKEND_URL="http://127.0.0.1:8787"
export O_AGENT_TOKEN_ID="…"
export O_AGENT_TOKEN_SECRET="…"

o-agent verify
o-agent open
```

Notes:
- `o-agent verify` requests a short‑lived certificate and caches it in `~/.o-agent/ssh/`.
- Best effort: if `SSH_AUTH_SOCK` exists, `o-agent verify` loads the key+cert into `ssh-agent` (plaintext key never stored at rest).
- `o-agent lost` wipes `~/.o-agent` completely.
