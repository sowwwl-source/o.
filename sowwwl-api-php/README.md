# sowwwl-api-php (single-file)

## Requirements
- PHP 8.1+
- MySQL 8+ (or MariaDB compatible)
- HTTPS recommended

## Setup
1) Create a DB and run:
   - `schema.sql`

2) Configure env vars (preferred) OR create `.env` from `.env.example`:
   - DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS

3) Deploy
- Simplest: put `index.php` as the web root entrypoint.
- Routes are handled by `index.php`.

## Endpoints
- GET  /health
- POST /auth/register  {email, password}
- POST /auth/login     {email, password}
- POST /auth/logout    {}
- GET  /me
- GET  /soul/token
- POST /soul/token     {token, config?} (requires X-CSRF)
- POST /soul/upload    multipart: archive (.zip) + manifest_json? (requires X-CSRF)

Uploads are stored under `SEED_ROOT` (default `/data`) in `soul.cloud/<uid>/uploads/`.

## Frontend integration (recommended)
Serve the frontend and proxy API calls through the same origin:
- Frontend serves the site
- `/api/*` reverse-proxies to the API and strips `/api` (so `/api/me` → `/me`)

This avoids CORS issues and makes session cookies work reliably.
