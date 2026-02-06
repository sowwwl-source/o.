# sowwwl-front-netlify

Dépose ce dossier comme site Netlify (publish = `.`).

Le front appelle le backend via `/api/*` (proxy Netlify).
- `GET /api/me`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`

⚠️ Mets `api.sowwwl.com` sur ton backend PHP (DigitalOcean App Platform ou serveur).
