# O.dit(gl0.balles) — Audit global de la constellation publique sowwwl

Date de constat principal: 17 mars 2026, 07:32 UTC

## Périmètre et méthode

Cet audit couvre:

- `sowwwl.com`
- `www.sowwwl.com`
- `sowwwl.cloud`
- `www.sowwwl.cloud`
- `api.sowwwl.com`
- `0.user.o.sowwwl.cloud`
- les parcours entre `sowwwl-front/`, `uzyx-app/`, les reverse proxies (`scripts/Caddyfile.example`, `scripts/nginx.conf.example`, `scripts/ensure-apache-front-site.sh`) et l'API `sowwwl-api-php`

Méthode:

- vérification live par `dig`, `curl -I`, `nc -vz 443`
- revue locale HTML/CSS/JS/TS/PHP avec preuves de code
- baseline non mutative des tests existants
- lecture sous un angle `expérimental lisible`: préserver le geste O., corriger ce qui casse l'accès, l'orientation, la confiance, la sûreté ou la continuité d'expérience

## Résumé exécutif

| Axe | Score | Lecture rapide |
| --- | --- | --- |
| Disponibilité | 0/5 | la constellation publique est effectivement hors service |
| UX / IA | 2/5 | le langage est fort, mais les promesses principales se brisent sur l'indisponibilité, les placeholders et des règles implicites nombreuses |
| Design / accessibilité | 2.5/5 | l'identité est nette et rare, mais les formulaires, la lisibilité procédurale et le contrôle des surcouches restent insuffisants |
| Sécurité / privacy | 2/5 | bonnes bases côté API, mais front plus fragile qu'il n'en a l'air: XSS possible, CSP absente, supply chain tierce |
| Performance / shareability | 2/5 | peu d'assets lourds sur la home, mais zéro métadonnée de partage, dépendances externes, et quelques pages 3D sans garde-fous forts |

### Forces à préserver

- Une direction artistique cohérente: typographie, matière ASCII, refus de l'image, palette bicolore, ton non marketing.
- Une vraie pensée de l'interface comme trajectoire et non comme dashboard (`sowwwl-front/index.html`).
- Des bases de sécurité sérieuses côté API: cookies `HttpOnly`/`Secure`/`SameSite`, CSRF, contrôle d'origine sur l'auth bootstrap, rate limiting (`sowwwl-api-php/index.php`).
- Une partie `uzyx-app` déjà plus disciplinée: redirection canonique, tests ciblés autour de `CloudGatePage`, garde-fous "no images", patterns ARIA plus cohérents.

### État réel des surfaces publiques

| Surface | DNS constaté | Réponse constatée | Lecture |
| --- | --- | --- | --- |
| `sowwwl.com` | Cloudflare IPs (`104.26.*`, `172.67.*`) | `HTTP/2 521` | Cloudflare en façade, origine KO |
| `www.sowwwl.com` | Cloudflare IPs | `HTTP/2 521` | même panne |
| `sowwwl.cloud` | `188.166.96.214` | `443 refused` | front canonique attendu, mais serveur non joignable |
| `www.sowwwl.cloud` | `188.166.96.214` | `443 refused` | même état |
| `api.sowwwl.com` | `188.166.96.214` | `443 refused` | API publique indisponible |
| `0.user.o.sowwwl.cloud` | `188.166.96.214` | `443 refused` | surface `uzyx-app` indisponible |

Preuves live relevées à `2026-03-17 07:32:36 UTC`:

```text
https://sowwwl.com         -> HTTP/2 521 (Cloudflare)
https://www.sowwwl.com     -> HTTP/2 521 (Cloudflare)
https://sowwwl.cloud       -> connection refused on 443
https://www.sowwwl.cloud   -> connection refused on 443
https://api.sowwwl.com     -> connection refused on 443
https://0.user.o.sowwwl.cloud -> connection refused on 443
```

## Findings prioritaires

| ID | Gravité | Surface | Preuve | Impact | Recommandation | À préserver |
| --- | --- | --- | --- | --- | --- | --- |
| OD-001 | P0 | constellation publique | `sowwwl.com` / `www.sowwwl.com` en `521`; `sowwwl.cloud`, `api.sowwwl.com`, `0.user.o.sowwwl.cloud` en `443 refused` | aucune expérience publique réellement utilisable; tout audit UX réel commence par une panne | restaurer la disponibilité avant toute optimisation fine: Cloudflare, listener 443, reverse proxy, certificats, santé origin, monitoring | la séparation front/app/api et le découpage des surfaces |
| OD-002 | P1 | domaine canonique / auth | `README.md:18-20` et `DEPLOYMENT.md:60-61,79-82` servent `sowwwl.com`; `scripts/Caddyfile.example:27-48` fait de `sowwwl.cloud` le canonique et redirige `sowwwl.com`; `login.html:18-20` demande de rester sur un seul domaine | confusion opérateur + utilisateur; fragilité directe pour les cookies de session et les redirections | choisir un seul canonique public, aligner docs, Caddy/nginx/Apache, Cloudflare, et copy du login | le modèle same-origin pour l'auth |
| OD-003 | P1 | promesse home -> app | `index.html:52-55,109,141-143,181-182,208` pousse `soul.cloud`; `uzyx-app/src/main.tsx:10-16` et `uzyx-app/src/app/canonical.ts:24-41` supposent la surface `.cloud` disponible | les CTA majeurs mènent au vide; la home vend une trajectoire qui ne peut pas s'accomplir | garder `soul.cloud` comme porte maîtresse, mais ajouter un fallback/état de maintenance/alternative locale tant que la surface n'est pas saine | le triptyque `FL0W / 0isO / soul.cloud` |
| OD-004 | P1 | sécurité front | `li3ns.html:117-120` insère `peer.handle` et `peer.comm_address` via `innerHTML` | XSS stockée ou réfléchie possible si une donnée API ou DB est corrompue; impact session + réputation | remplacer par des nœuds `textContent`, assainir côté serveur, tester explicitement les caractères dangereux | le rendu carte/badges de `li3ns` |
| OD-005 | P1 | hardening front / supply chain | `14` pages HTML sur `26` ont des scripts inline; `description_meta_matches=0`; `csp_matches=0`; `o.css:1` charge Google Fonts; `m4p.html:38-41` et `d0rs.html:51` chargent des libs CDN | pas de CSP sérieuse possible aujourd'hui, surface d'injection plus large, dépendance tierce en contradiction avec une posture "publique mais sobre" | externaliser les scripts inline, passer par une CSP `report-only` puis stricte, self-hoster ou au minimum intégrer avec contrôle d'intégrité les dépendances tierces | l'architecture statique légère, sans build obligatoire pour le front historique |
| OD-006 | P2 | payoff post-login | `sh0re.html:18,27-31` avoue un placeholder; `/0` affiche des cartes `href="#"` pour `sal00ns`, `call`, `mail` (`0.html:184-200`) | chute de confiance après login; impression d'univers ouvert mais non opérable | masquer les surfaces non prêtes ou les transformer en cartes d'état explicites avec horizon, pas en faux CTA | le hub `/0` comme point source |
| OD-007 | P2 | accessibilité formulaires | `login.html:25-37`, `li3ns.html:21-27`, `l4nd.html:55-58`, `t0ken.html`, `c0ur.html` reposent largement sur placeholders; `14` contrôles trouvés, peu de labels explicites | coût élevé pour lecteurs d'écran, dictée vocale, compréhension rapide et mémorisation | ajouter labels visibles ou `sr-only`, descriptions courtes et associations explicites | la sobriété textuelle et la faible densité visuelle |
| OD-008 | P2 | couche d'interaction globale | `bicolor.js:350-370` réagit à `i`; `405-484` glitche les liens; `486-711` injecte un contrôle capteur; `713-1198` injecte pétales, intro shell, swipe et raccourcis | richesse sensible, mais charge cognitive élevée et règles cachées; risque d'effet "système plus fort que la page" | garder l'inversion et l'arborescence, mais phaser les aides, réduire les surcouches sur premier contact, et durcir le mode réduit / mobile | l'interface comme instrument, pas comme UI standard |
| OD-009 | P2 | shareability / découvrabilité | `index.html:4-7` et `uzyx-app/index.html:4-11` n'ont ni description, ni OG, ni canonical, ni twitter cards | aperçus pauvres, moindre confiance au partage, repères faibles pour moteur et messagerie | ajouter un méta-pack minimal par surface et un canonique cohérent | le ton anti-marketing, sans le traduire en invisibilité totale |

## Analyse détaillée

### 1. Disponibilité et canonique

Le problème principal n'est pas "un front imparfait". Le problème principal est une constellation publique indisponible.

- `sowwwl.com` et `www.sowwwl.com` répondent via Cloudflare en `521`, ce qui indique une origine non joignable par Cloudflare.
- `sowwwl.cloud`, `www.sowwwl.cloud`, `api.sowwwl.com` et `0.user.o.sowwwl.cloud` pointent directement vers `188.166.96.214`, mais refusent la connexion sur `443`.
- Cela ressemble davantage à une panne d'exploitation ou de configuration réseau/proxy/certificat qu'à un problème purement applicatif.

Le second problème structurel est la dérive documentaire:

- `README.md:18-20` et `DEPLOYMENT.md:60-61,79-82` présentent encore `sowwwl-front` comme site servi sur `sowwwl.com`.
- `scripts/Caddyfile.example:27-48` décrit au contraire `sowwwl.cloud` comme homepage canonique et relègue `sowwwl.com` en redirection `308`.
- `scripts/nginx.conf.example:64-107` reste orienté `sowwwl.com`.
- `login.html:18-20` ajoute une contrainte utilisateur forte: rester sur un seul domaine pendant l'auth.

Lecture:

- les choix de domaine ne sont pas stabilisés dans la doc ni dans les configs
- cette ambiguïté est particulièrement dangereuse pour une architecture qui dépend justement d'un proxy same-origin et de cookies de session liés à l'hôte (`sowwwl-api-php/index.php:75-84`)

### 2. UX / IA / parcours

#### Home (`sowwwl-front/index.html`)

La home a une vraie force d'auteur:

- elle ouvre trois trajectoires nettes (`FL0W`, `0isO` via `soul.cloud`, `/0`)
- elle garde une cohérence forte dans le langage, la matière et le refus du dashboard (`index.html:20-22,46-55,90-124`)

Mais elle a trois défauts majeurs côté expérience:

- elle affiche `sowwwl.cloud` comme repère d'identité (`index.html:13`) alors que l'état live valide plutôt `sowwwl.com` en façade Cloudflare, sans service disponible derrière
- ses CTA les plus structurants pointent vers une surface `.cloud` actuellement morte (`index.html:54,109,142,208`)
- elle n'offre aucun mode de dégradation explicite: pas d'état de maintenance, pas de fallback, pas de message "surface indisponible"

Résultat:

- l'objet paraît plus vivant en local qu'en production
- la promesse "page d'accueil qui ouvre des trajectoires" se retourne contre elle dès lors que la première trajectoire forte est indisponible

#### Hub `/0`

`/0` est une bonne idée conceptuelle: un point source qui expose l'état opérable (`0.html:16-35`).

Mais dans son état actuel:

- il dépend immédiatement de `/api/health` et `/api/me` (`0.html:85-106`)
- il mélange surfaces réelles et surfaces fictives dans le même registre d'affordance (`0.html:184-200`)
- il affiche des badges de disponibilité sans distinguer clairement "prototype", "placeholder", "hors service live", "non déployé"

Pour l'utilisateur, `source` devrait être l'endroit le plus honnête du système. Aujourd'hui, il ressemble encore à un index interne exposé trop tôt.

#### Auth, `sh0re`, `l4nd`, `li3ns`

Le flux a une logique:

- `login` crée ou ouvre une session (`login.html:47-90`)
- `sh0re` devient la première rive post-login (`sh0re.html:16-24`)
- `sh0re` redirige vers `l4nd` si aucun type de land n'est encore fixé (`sh0re.html:76-82`)

Mais l'expérience post-auth manque de gratification et de clarté:

- `sh0re` est explicitement un placeholder (`sh0re.html:27-31`)
- `l4nd` est plus fort conceptuellement que `sh0re`, donc le premier écran post-login est le moins abouti des deux
- `li3ns` a une logique d'action solide, mais l'habillage de debug (`Réponse`, état brut JSON) reste au premier plan (`li3ns.html:29-30,68-70`)

La bonne lecture produit ici n'est pas "rendre ça plus normal". La bonne lecture est: rendre le payoff plus direct, plus net, plus franc.

### 3. Design / accessibilité / interactions

#### Qualités du système visuel

Le système a une vraie tenue:

- palette finement pensée dans `o.css:3-168`
- usage mesuré de `clamp()`, grilles adaptatives et breakpoints (`o.css:55,290,380,1162-1225`)
- traitement image-less crédible
- focus visible présent sur les liens et boutons (`o.css:242-244,273-275`)
- amorce de `prefers-reduced-motion` (`o.css:1016-1019`)

#### Dettes d'accessibilité

Les formulaires historiques sont trop bruts:

- `login.html:25-37` n'a pas de labels explicites
- `li3ns.html:21-27` idem
- `l4nd.html:55-58` repose sur un `textarea` sans label associé

Conséquences:

- moindre lisibilité pour lecteurs d'écran
- moindre robustesse pour dictée vocale et navigation contextuelle
- coût cognitif plus fort pour les utilisateurs qui ne lisent pas le système "par immersion"

#### Interactions globales

`bicolor.js` est impressionnant, mais très chargé:

- synchronisation `/api/me` au chargement et au focus (`bicolor.js:350-356`)
- touche globale `i` (`358-370`)
- glitch périodique des liens (`405-484`)
- contrôle mobile par capteur et scroll incliné (`486-711`)
- navigation pétales injectée dans le DOM, avec intro shell, hints, swipe et raccourcis (`713-1198`)
- geste secret `O` ensuite, encore plus profond dans le fichier

Le problème n'est pas l'existence de ces gestes. Le problème est leur empilement:

- trop de systèmes cohabitent sur le même premier contact
- plusieurs règles restent implicites
- la page n'explique pas clairement ce qui est optionnel, expérimental, structurel ou réservé au mobile

`glitch-oe.js:1-104` ajoute encore une couche: certains caractères de texte deviennent des liens `manif3st` / `qu3st`. Le geste est élégant, mais il doit être considéré comme un épice, pas comme un canal de navigation nécessaire.

### 4. Sécurité / privacy

#### Bons fondements côté API

`sowwwl-api-php/index.php` contient des protections réelles:

- headers de base (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) en `1-24`
- cookies de session paramétrés proprement en `75-84`
- CSRF en `106-112`
- contrôle d'origine sur le bootstrap auth en `128-152`
- rate limiting auth en `172+`
- précautions sur redirect / host en admin magic verify (`798-851`)

Ces bases permettent une remédiation front sans repartir de zéro.

#### Faiblesses côté front / edge

Le hardening reste incomplet:

- aucune trace de `Content-Security-Policy` ni `Permissions-Policy` dans les configs consultées
- les proxies exemples ne règlent que `HSTS`, `nosniff`, `X-Frame-Options`, `Referrer-Policy` (`scripts/Caddyfile.example:17-22,35-40,54-58`, `scripts/nginx.conf.example:26-29,79-82,122-125`, `scripts/ensure-apache-front-site.sh:154-158`)
- `14` pages HTML du front statique embarquent leur propre `<script>`, ce qui rend une CSP propre impossible sans refactor
- `li3ns.html:119` ouvre une vraie porte XSS
- `o.css:1` appelle Google Fonts
- `m4p.html:39-41` et `d0rs.html:51` appellent des scripts CDN tiers au runtime

Le contraste est net:

- backend prudent
- frontend plus permissif

Il faut remettre les deux niveaux à la même altitude.

### 5. Performance et shareability

Le front principal n'est pas lourd en absolu:

- `o.css`: `27,721` octets
- `bicolor.js`: `49,138` octets
- `glitch-oe.js`: `3,275` octets
- `index.html`: `9,344` octets

Mais l'écosystème souffre autrement:

- absence totale de `meta description`, `og:*`, `twitter:*`, `canonical`
- absence d'icône et de marqueurs de partage
- dépendances tierces non négligeables pour un projet qui revendique la maîtrise de sa matière
- pages 3D (`m4p`, `d0rs`) chargées sans build step ni fallback clair en cas d'échec réseau

`uzyx-app/index.html:4-15` est plus propre techniquement, mais lui aussi n'expose presque aucune métadonnée publique.

## Spécificités `uzyx-app`

La surface `uzyx-app` paraît plus disciplinée que le front historique.

Points solides:

- enforcement du canonique `.cloud` côté client (`uzyx-app/src/main.tsx:10-16`, `uzyx-app/src/app/canonical.ts:24-41`)
- clarification du domaine `.cloud` comme espace où la clé SSH publique devient structurante (`uzyx-app/src/app/env.ts:6-9`)
- `CloudGatePage` explicite mieux l'état courant: hôte, session, exigence SSH, statut token, upload (`CloudGatePage.tsx:67-220,292-609`)
- tests existants verts sur la gate et l'upload

Tension UX à surveiller:

- la home `uzyx-app` est très minimale (`HomePage.tsx:18-42`)
- la gate `cloud` est cohérente mais exigeante: clé SSH publique, `principal_id`, token, upload, terminal guide
- cette densité conceptuelle est acceptable seulement si la home publique la prépare mieux et si le runtime est fiable

En d'autres termes: `uzyx-app` n'est pas le maillon faible du système sur le plan conceptuel; il est plutôt victime de l'indisponibilité infra et d'une home publique qui promet sans assez amortir.

## Baseline technique

Checks exécutés:

- `node --test sowwwl-front/tests/*.test.mjs`
  - `8` tests passés
- `npm test -- --run src/pages/__tests__/CloudGatePage.test.tsx src/pages/__tests__/cloudGateUpload.test.ts` dans `uzyx-app`
  - `7` tests passés

Lecture:

- le socle local n'est pas en ruine
- le problème n'est pas une base de code totalement incontrôlée
- le plus urgent est bien la constellation déployée, puis le durcissement et la clarification des parcours historiques

## Backlog priorisé

### NOW

| Action | Effort | Pourquoi maintenant |
| --- | --- | --- |
| Rétablir `443` sur `sowwwl.cloud`, `api.sowwwl.com`, `0.user.o.sowwwl.cloud` et l'origine Cloudflare de `sowwwl.com` | M | sans cela, tout le reste reste théorique |
| Choisir un canonique public unique et réaligner docs, proxies, Cloudflare, login copy | S | supprime une source directe de casse auth et d'erreur opératoire |
| Corriger `li3ns.html` pour supprimer `innerHTML` sur données utilisateur | S | dette sécurité immédiate |
| Prévoir un état de maintenance / fallback sur les CTA `soul.cloud` de la home | S | empêche la promesse cassée |
| Masquer les fausses portes `#` de `/0` et assumer l'état "non prêt" de `sh0re` | S | améliore la confiance sans normaliser l'esthétique |
| Ajouter labels explicites aux formulaires critiques (`login`, `li3ns`, `l4nd`, `t0ken`) | S | gain accessibilité rapide et peu coûteux |

### NEXT

| Action | Effort | Pourquoi ensuite |
| --- | --- | --- |
| Extraire les scripts inline du front statique et préparer une CSP `report-only` | M | condition nécessaire à un vrai hardening navigateur |
| Ajouter `Permissions-Policy` et un set de headers plus complet côté edge | S | réduit la surface de capacités non utilisées |
| Remplacer Google Fonts et les CDN JS critiques par des assets maîtrisés ou protégés | M | cohérence privacy + robustesse offline |
| Recomposer la home pour hiérarchiser plus franchement `FL0W`, `soul.cloud`, `/0`, avec état live visible | M | préserve le geste, réduit l'opacité inutile |
| Réduire les surcouches injectées au premier contact et renforcer `prefers-reduced-motion` | M | diminue fatigue cognitive et friction mobile |
| Ajouter un méta-pack minimal (`description`, `og`, `twitter`, `canonical`) | S | améliore partage, lisibilité publique et confiance |

### LATER

| Action | Effort | Pourquoi plus tard |
| --- | --- | --- |
| Repenser le payoff post-login pour que `sh0re` soit un vrai seuil, pas un placeholder | M | chantier contenu + produit, pas seulement technique |
| Clarifier la pédagogie `0isO / principal_id / soul.cloud` entre home et `uzyx-app` | M | important, mais après retour de la fiabilité |
| Mettre en place monitoring synthétique et alerting multi-host | S | évite de redécouvrir la panne par audit manuel |
| Documenter explicitement les gestes signatures (inversion, arborescence, glitch, `O`) et leurs modes d'activation | S | protège l'originalité tout en réduisant l'ésotérisme subi |

## Conclusion

`sowwwl` possède déjà quelque chose que beaucoup de sites n'auront jamais: une matière, une voix, une logique spatiale, un refus crédible de l'interface moyenne. Le problème n'est donc pas un manque de style. Le problème est un manque de continuité entre la promesse, l'exploitation et le niveau de sûreté du front historique.

La bonne stratégie n'est pas de normaliser `sowwwl`. La bonne stratégie est:

1. restaurer la constellation publique
2. stabiliser le canonique et les parcours auth
3. durcir le front au niveau du backend
4. rendre les gestes et les portes plus lisibles sans les banaliser

Le site n'a pas besoin de devenir plus conventionnel. Il a besoin de devenir plus fiable, plus honnête dans ses états, et plus lisible dans ses seuils.
