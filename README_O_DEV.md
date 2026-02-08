# O. — How to test (dev)

## Run
- `make live` → site on `http://localhost:8080` (same-origin `/api/*` proxy)
- (Optional) `make init-db` after schema updates

## Secret gesture “O” (rotation inertielle)
- Works on any page (pointer/touch).
- Debug overlay:
  - open `http://localhost:8080/dev.html`, or
  - add `?o_debug=1` to any URL.
- Optional audio hint (must be user-enabled): in DevTools console → `localStorage.setItem('o:audio','1')`

### Outcomes (equal)
- **Clockwise (cw)** → `GET /ev3nt.html`
- **Counter-clockwise (ccw)** → `GET /t0ken.html`

## Token / Config / Upload (V0)
1) Go to `http://localhost:8080/t0ken.html`
2) Enter a token (local validation)
3) Select a `.zip` to run the **local pre-scan** (no upload yet)
4) Upload requires a session:
   - use `http://localhost:8080/login.html` to register/login
   - then re-open `t0ken.html` and upload

### Endpoints
- `GET /api/soul/token` → `{ token_set, token_hint, config?, updated_at? }` (auth)
- `POST /api/soul/token` JSON `{ token, config? }` (auth + `X-CSRF`)
- `POST /api/soul/upload` multipart:
  - file field `archive` (zip)
  - optional `manifest_json` (stringified JSON)
  - (auth + `X-CSRF`)

### Storage (transparent, V0)
- DB tables: `soul_cloud`, `soul_uploads`
- Files: `SEED_ROOT/soul.cloud/<uid>/uploads/*.zip` (`SEED_ROOT` defaults to `/data`)
- Env limit: `SOUL_UPLOAD_MAX_BYTES` (default `104857600`)

