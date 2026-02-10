# Admin magic link — tests (manual)

Pré-requis (prod / staging)
- `O_NETWORK_ADMINS` contient `0wlslw0@protonmail.com`.
- Reverse proxy same-origin actif (le `/api/*` **strip** `/api`).
- (recommandé) `O_ADMIN_MAGIC_PUBLIC_HOST=0.user.o.sowwwl.cloud` pour forcer le domaine des liens (évite les variations de Host).
- Envoi email :
  - prod (Docker) : `O_ADMIN_MAGIC_MAIL_MODE=smtp` + variables SMTP (recommandé)
  - dev : `O_ADMIN_MAGIC_MAIL_MODE=outbox` écrit un JSON dans `O_ADMIN_MAGIC_OUTBOX_DIR`

Endpoints
- Envoi: `POST /api/auth/admin/magic/send` `{ "email": "0wlslw0@protonmail.com" }`
- Vérif (recommandé): lien e-mail → UI `/#/admin/magic/verify?token=...` → POST `/api/auth/admin/magic/verify` (session) → `/#/admin/b0ard`
- Vérif (legacy): `GET /api/auth/admin/magic/verify?token=...` (302 → `/#/admin/b0ard`)

Notes de sécurité
- Le token n’est jamais renvoyé par l’API “send”, ni affiché dans l’UI.
- Le token est lié à un host (`issued_host`) : changer de domaine → refus.

---

## 1) Envoi réussi → mail reçu → clic → session admin OK

1. Appeler l’envoi (depuis le domaine cible, ex `https://0.user.o.sowwwl.cloud`):
   - `curl -sS -X POST -H 'content-type: application/json' -d '{\"email\":\"0wlslw0@protonmail.com\"}' https://0.user.o.sowwwl.cloud/api/auth/admin/magic/send`
   - Attendu: HTTP `200` + JSON `{"status":"ok"}` (anti-énumération)
2. Vérifier la réception du mail et cliquer le lien (une seule fois).
3. Après redirection, vérifier la session:
   - `curl -sS -c cookies.txt -b cookies.txt https://0.user.o.sowwwl.cloud/api/me`
    - Attendu: `user.network_admin: true` (si `O_NETWORK_ADMINS` est correct).

## 2) Lien expiré → refus + message texte

1. Demander un magic link (réponse 200 même si l’envoi échoue; vérifier l’outbox/logs si besoin).
2. Attendre ≥ 15 minutes (TTL clamp 10..15).
3. Cliquer le lien.
4. Attendu: HTTP `410` + JSON `{"error":"expired","message":"Lien expiré."}`.

## 3) Lien déjà utilisé → refus

1. Demander un magic link.
2. Cliquer le lien (succès + redirection).
3. Cliquer le même lien une seconde fois.
4. Attendu: HTTP `410` + JSON `{"error":"used","message":"Lien déjà utilisé."}`.

## 4) Tentative sur mauvais domaine → refus

1. Demander un magic link sur le bon domaine (ex `0.user.o.sowwwl.cloud`).
2. Prendre le lien reçu et remplacer uniquement le host (ex `sowwwl.com`) en gardant le hash:
   - `https://sowwwl.com/#/admin/magic/verify?token=...`
3. Attendu: HTTP `403` + JSON `{"error":"wrong_domain","message":"Mauvais domaine."}`.
