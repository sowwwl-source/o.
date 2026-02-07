# sowwwl-front

Frontend statique (HTML/CSS/JS).

Le front appelle le backend via `/api/*` (reverse proxy même origine).
- `GET /api/me`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`

⚠️ En prod, configure ton reverse proxy pour que `/api/*` proxy vers l’API **en retirant** le préfixe `/api`
(ex: `/api/me` → `/me`).
