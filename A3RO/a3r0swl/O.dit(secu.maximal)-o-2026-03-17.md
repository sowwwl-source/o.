# O.dit(secu.maximal) - Audit securite total du repo `o.`

Date de constat principal: 17 mars 2026, 08:01 UTC

## Perimetre et methode

Perimetre couvre:

- `sowwwl-front`
- `uzyx-app`
- `sowwwl-api-php`
- `backend`
- `agent`
- `admin`
- `infra`
- `scripts`
- `.github/workflows`
- `docker-compose.yml`
- `README.md`
- `README_SSHCA.md`
- `DEPLOYMENT.md`
- les surfaces publiques `sowwwl.com`, `www.sowwwl.com`, `sowwwl.cloud`, `www.sowwwl.cloud`, `api.sowwwl.com`, `0.user.o.sowwwl.cloud`

Methodes executees:

- verification live par `dig`, `curl -I`, `curl -sk`, `nc -vz`
- revue locale du code, des proxies, des workflows et des docs d'exploitation
- baseline non mutative de securite et de tests existants
- recherche systematique de secrets, creds par defaut, sinks DOM non surs, headers manquants, liaisons `0.0.0.0`, Basic Auth, URLs backend et derives de domaine

## Resume executif

| Axe | Score | Lecture |
| --- | --- | --- |
| Exposition externe | 0.5/5 | les surfaces publiques sont indisponibles ou cassent avant toute verification applicative serieuse |
| AuthN / AuthZ | 2.5/5 | bonnes bases cote API et SSH CA, mais admin UI trop fragile operationnellement et agent trop permissif sur le transport |
| AppSec | 2/5 | XSS front verifiee, CSP absente, tiers runtime trop ouverts |
| Secrets & CI/CD | 2/5 | pas de secret live commite trouve, mais beaucoup de defaults dangereux et une chaine de deploiement encore trop souple |
| Resilience operationnelle | 0.5/5 | edge/downstream incoherents, aucun chemin public sain constate le 17 mars 2026 |

Lecture courte:

- La priorite absolue n'est pas un "durcissement fin". La priorite absolue est de restaurer un chemin d'exposition coherent et verifiable.
- La pile `sowwwl-api-php` et la pile SSH CA ont de vraies bases securitaires. Le point faible principal est le bord public et l'ecart entre rigueur back et permissivite front/ops.
- Le repo ne montre pas de fuite evidente de secret live. Le danger vient surtout des defaults, de l'exploitation et des surfaces implicitement exposees.

## Baseline de verification

Checks live:

- `sowwwl.com` et `www.sowwwl.com` repondent `HTTP/2 521` via Cloudflare
- `sowwwl.cloud`, `www.sowwwl.cloud`, `api.sowwwl.com` et `0.user.o.sowwwl.cloud` resolvent vers `188.166.96.214` mais refusent `443`

Preuve live a `2026-03-17 08:01:38 UTC`:

```text
https://sowwwl.com              -> HTTP/2 521
https://www.sowwwl.com          -> HTTP/2 521
https://sowwwl.cloud            -> connection refused on 443
https://www.sowwwl.cloud        -> connection refused on 443
https://api.sowwwl.com          -> connection refused on 443
https://0.user.o.sowwwl.cloud   -> connection refused on 443
```

Checks dependances:

- `npm audit --omit=dev` sur `backend`, `agent`, `admin`, `uzyx-app`, `social3d`: `0` vulnerabilite prod remontee
- aucune fuite franche de type `BEGIN PRIVATE KEY`, `AGE-SECRET-KEY-...` live, token GH ou cle API n'a ete trouvee dans le code suivi

Checks de tests:

- `backend`: passe (`1` test)
- `agent`: passe (`3` tests)
- `sowwwl-front`: passe (`8` tests)
- `sowwwl-api-php/tests/*_test.php`: passe (`5` tests)
- `uzyx-app`: la suite complete locale echoue actuellement sur `src/quest/__tests__/QuestDeltaPanel.test.tsx`; ce n'est pas traite ici comme finding securite
- `admin`: pas de script `test` dans `admin/package.json`
- `social3d`: pas de script `test` dans `social3d/package.json`

## Points forts a preserver

- `sowwwl-api-php/index.php:75-152` pose une vraie hygiene session/cookie/CSRF/origin-check.
- `sowwwl-api-php/index.php:762-851` defend correctement le flux magic-link admin contre l'enumeration triviale, le mauvais domaine et l'open redirect.
- `backend/src/crypto.ts:15-24` et `backend/src/ssh/ca.ts:21-90` ont une posture saine: secrets de token haches en HMAC, compare timing-safe, certs SSH courte duree, options `no-port-forwarding`, `no-agent-forwarding`, `no-x11-forwarding`, fichiers temporaires nettoyes.
- `agent/src/age.ts:8-36` et `agent/src/ssh.ts:21-49` stockent la matiere sensible localement avec des permissions `0600` et sans cle privee en clair au repos.
- `infra/bastion/sshd_config.snippet:11-25` formalise correctement un bastion CA-only.

## Cartographie des frontieres de confiance

| Surface | Role | Frontiere critique |
| --- | --- | --- |
| `sowwwl-front` | front statique historique | depend d'un proxy same-origin `/api/*`, mais reste permissif cote DOM et headers |
| `uzyx-app` | SPA `.cloud` plus disciplinee | suppose un canonique `.cloud` sain et un backend same-origin stable |
| `sowwwl-api-php` | API session-based | securite correcte si meme domaine + HTTPS + proxy sain restent vrais |
| `admin` | UI d'admin SSH CA | Basic Auth statique en facade, puis Bearer admin vers le backend |
| `backend` | CA signer | forte valeur cryptographique, doit etre expose de facon minimale et maitrisee |
| `agent` | composant local poste client | doit rester loopback-only, sinon divulgue l'etat local |
| Workflows + scripts | chaine d'exploitation | aujourd'hui la plus forte source de derive pratique |

Nuance importante:

- l'absence de `Access-Control-Allow-Origin` large n'est pas un bug ici; le design vise explicitement le same-origin
- `helmet({ contentSecurityPolicy: false })` dans `backend/src/app.ts:19` n'est pas, seul, une faille critique puisque ce backend sert du JSON, pas du HTML; le vrai probleme est que les surfaces navigateur n'imposent pas de CSP ailleurs

## Findings prioritaires

| ID | Gravite | Surface | Preuve | Preconditions d'exploitation | Impact | Remediation | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-001 | P0 | Edge public / disponibilite | live `521` sur `sowwwl.com`, `443 refused` sur les surfaces `.cloud` et `api.sowwwl.com` | aucune | indisponibilite totale, impossibilite de verifier le hardening runtime reel, perte de confiance immediate | restaurer un listener `443` sain, aligner Cloudflare/proxy/certs, ajouter healthchecks et monitoring externe | M |
| SEC-002 | P1 | `agent` local UI | `agent/src/ui/server.ts:15-45`, `agent/ui/index.html:90-99` | attaquant sur le meme reseau local ou meme machine, port decouvert | fuite de `tokenId`, `backendUrl`, chemin local `home`, detection de la presence de l'agent | binder explicitement `127.0.0.1`, ajouter nonce d'acces ou socket local, limiter la duree de vie du serveur | S |
| SEC-003 | P1 | `sowwwl-front/li3ns.html` | `sowwwl-front/li3ns.html:117-120` | donnee `handle` ou `comm_address` corrompue cote DB/API | XSS en session authentifiee, pivot vers actions API et atteinte de confiance | remplacer `innerHTML` par des noeuds DOM `textContent`, ajouter test de non-regression XSS | S |
| SEC-004 | P1 | hardening navigateur | `16` scripts inline dans `sowwwl-front`; aucun match `Content-Security-Policy` ou `Permissions-Policy`; tiers runtime dans `sowwwl-front/m4p.html:39-41`, `sowwwl-front/d0rs.html:51`, `sowwwl-front/assets/css/o.css:1` | injection DOM, compromission CDN, typo de domaine ou script malicieux | pas de confinement navigateur credible aujourd'hui, surface d'execution trop large | externaliser les scripts inline, passer par CSP `report-only` puis stricte, self-host/SRI pour les tiers, ajouter `Permissions-Policy` | M/L |
| SEC-005 | P2 | `admin` SSH CA | `admin/proxy.ts:20-47`, `README_SSHCA.md:16-19,60-68` | interface admin exposee a internet, cred reuse, force brute au bord | compromission du cycle de vie des tokens SSH CA si la facade tombe | garder l'admin derriere VPN/Tailscale/IP allowlist, ajouter rate limiting edge et idealement SSO fort plutot que Basic Auth seule | M |
| SEC-006 | P2 | transport `agent` -> `backend` | `agent/src/config.ts:15-19`, `agent/src/backend.ts:10-18` | backend non-loopback configure en `http://` ou MITM | vol du secret de token, emission de certificats non autorisee | exiger `https://` sauf `localhost`/`127.0.0.1`/`::1`, journaliser le refus des URLs non TLS | S |
| SEC-007 | P2 | secrets / creds operationnels | `docker-compose.yml:6-9,29-33`, `scripts/db-manager.sh:37-43,70-73,98-108,126-137`, `Makefile:57-59`, `DEPLOYMENT.md:114-120` | copier-coller operateur, usage non surveille, environnement interne trop confiant | mots de passe predecibles, derive "ca marche en insecure donc on garde", dette de securite recurrente | supprimer les defaults sensibles, lire uniquement depuis l'env reel, faire echouer les scripts si creds absentes, purger la doc des exemples secrets statiques | S/M |
| SEC-008 | P2 | integrite CI/CD | `deploy-api.yml:170-177`, `deploy-frontend.yml:85-91`, `deploy-uzyx.yml:153-160` | GHCR indisponible, cert invalide sur la droplet, derive outillage serveur | provenance du binaire de prod affaiblie, checks TLS qui ne detectent pas un mauvais certificat | interdire le fallback build local en prod, preferer image signee/pulled uniquement, retirer `-k` des `curl --resolve` | M |
| SEC-009 | P2 | exposition des services | `backend/src/index.ts:25-26`, `sowwwl-api-php/Dockerfile:18-22`, configs edge sans CSP/Permissions Policy dans `scripts/Caddyfile.example:17-22,35-40,54-59`, `scripts/nginx.conf.example:26-29,78-82,122-125` | port expose par erreur, proxy cassant ou bypass local | surface de service plus large que necessaire, hardening navigateur incomplet | binder explicitement les services au bon host, servir l'API via stack web de prod, etendre le set de headers de securite | M |

## Analyse detaillee

### 1. Exposition externe et domaine canonique

L'etat du 17 mars 2026 est un P0 de securite operationnelle.

- `sowwwl.com` et `www.sowwwl.com` passent par Cloudflare mais tombent en `521`.
- `sowwwl.cloud`, `www.sowwwl.cloud`, `api.sowwwl.com` et `0.user.o.sowwwl.cloud` pointent directement vers `188.166.96.214` et refusent `443`.
- les docs, proxies et redirects restent incoherents entre `.com` et `.cloud`, ce qui fragilise un modele qui depend justement du same-origin et des cookies lies a l'hote.

Tant que ce socle n'est pas restaure, toute lecture "headers reels", "certs reels", "cookies reels" reste incomplete cote runtime.

### 2. Revue applicative

#### Web public + API

Le contraste principal du repo est ici:

- le backend PHP est nettement plus soigne que le front historique
- le front historique reste expressif, mais trop libre pour une surface authentifiee

Ce qui est solide:

- `sowwwl-api-php/index.php:75-85` configure proprement le cookie de session
- `sowwwl-api-php/index.php:106-152` defend correctement CSRF et login CSRF
- `sowwwl-api-php/index.php:172-280` implemente un rate limit auth utile
- `sowwwl-api-php/index.php:844-847` defend contre l'open redirect

Ce qui casse la posture:

- `sowwwl-front/li3ns.html:117-120` est un sink XSS direct
- `social3d/src/main.ts:198-203` utilise aussi `innerHTML`, mais sur un message d'erreur local; c'est un risque bien moindre, a traiter plus tard
- `sowwwl-front` compte `16` scripts inline sur `26` pages HTML; aucune CSP credible ne peut etre posee tant que cette situation reste vraie
- aucun header `Content-Security-Policy` ou `Permissions-Policy` n'apparait dans `backend`, `admin`, `agent`, `sowwwl-api-php`, `uzyx-app`, `scripts` ou les docs d'exploitation
- le front charge encore Google Fonts et des libs `jsdelivr` au runtime

#### Stack SSH CA

La base crypto et le modele de delegation sont bons:

- token secrets haches cote serveur
- certificats SSH a duree courte, TTL borne
- KRL possible
- options de cert restrictives cote `ssh-keygen`
- agent local chiffrant les secrets avec `age`

Les angles morts ne sont pas cryptographiques, ils sont d'exposition:

- l'UI locale de l'agent ecoute sans host explicite et renvoie des informations locales utiles a un attaquant de proximite
- `agent/src/config.ts:15-19` accepte `http://`, donc le secret de token peut sortir en clair si l'operateur configure un backend non loopback sans TLS
- l'admin UI repose sur une Basic Auth statique; acceptable sur surface strictement privee, trop fragile si elle glisse vers l'internet public
- `backend/src/validation.ts:1-7` ne fait qu'une validation regex minimale de la cle publique SSH; `ssh-keygen` rattrape une partie du probleme plus loin, mais la defense en profondeur reste faible

### 3. CI/CD, secrets et exploitation

La chaine GitHub Actions est fonctionnelle, mais elle porte encore des compromis de "deblocage" qui deviennent des dettes de securite:

- `deploy-api.yml` peut builder localement sur le serveur si le pull GHCR echoue; c'est pratique, mais cela affaiblit la provenance du binaire de prod
- `deploy-frontend.yml` et `deploy-uzyx.yml` verifient les hosts avec `curl -k`, ce qui empeche de detecter un probleme certificat
- plusieurs scripts et exemples normalisent des creds faibles ou statiques (`rootpass`, `sowwwlpass`, `change_me`)
- `scripts/db-manager.sh` et `Makefile` ne lisent pas le mot de passe DB depuis l'environnement; ils codent en dur une valeur de dev

Point important:

- aucun secret live evident n'a ete trouve dans le code suivi
- le probleme n'est pas une fuite deja commise, mais le fait que les outils d'exploitation rendent l'erreur future trop facile

### 4. Ce que je n'ai pas retenu comme findings severes

- absence de CORS large: ici c'est plutot un bon signal, le systeme veut du same-origin
- `helmet({ contentSecurityPolicy: false })` cote `backend`: ce n'est pas le coeur du risque puisque le backend sert du JSON
- `npm audit --omit=dev`: rien de rouge cote prod actuellement
- les tests PHP et SSH CA passent; le coeur logique n'a pas l'air negligent

## Backlog priorise

### Fix first

- retablir un chemin public coherent et monitorable pour `sowwwl.com` / `.cloud` / `api.sowwwl.com`
- binder l'agent UI sur `127.0.0.1` seulement et couper l'exposition des infos locales
- corriger `li3ns.html` pour supprimer `innerHTML`
- retirer tous les defaults DB sensibles des scripts et faire echouer la config si non renseignee
- mettre l'admin SSH CA derriere une barriere reseau forte si ce n'est pas deja le cas

### Next

- imposer `https://` pour tout backend agent non loopback
- refactorer les `16` scripts inline du front pour ouvrir une migration CSP
- self-host ou SRI des tiers runtime front
- supprimer le fallback build local de `deploy-api.yml` sur les environnements de prod
- retirer `-k` des checks TLS GitHub Actions

### Later

- etendre la couverture de tests a `admin` et `social3d`
- renforcer la validation de cle SSH avant passage a `ssh-keygen`
- ajouter un paquet de headers moderne coherent sur les surfaces navigateur (`CSP`, `Permissions-Policy`, potentiellement `COOP`/`CORP` selon besoin)
- documenter explicitement le canonique unique et faire converger docs, proxies et DNS

## Related doc

Les constats front/public deja documentes dans `A3RO/a3r0swl/O.dit(gl0.balles)-sowwwl-2026-03-17.md` restent valides. Le present document les reprend seulement quand ils touchent la securite, l'exposition ou la confiance.
