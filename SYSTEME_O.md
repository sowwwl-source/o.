# Système O

SYSTÈME O. — ARCHITECTURE DE NAVIGATION & D’INTERACTION  
Document d’architecture fonctionnelle et narrative — Version actée — sans images, bicolore, respirante

## 0. Préambule

Ce document acte le système de navigation, d’interaction et de narration du projet O. Il ne s’agit ni d’un concept art, ni d’un manifeste, ni d’un brief esthétique.

C’est un document de référence opérationnel destiné à :

- guider l’implémentation (VS Code / Codex)
- préserver les choix fondateurs
- empêcher les dérives UI classiques (centrage, surcharge, iconographie)

Principe cardinal : ne rien écraser de ce qui existe déjà, seulement structurer et fusionner.

## 1. Règles Fondamentales (non négociables)

### 1.1 Zéro image dans l’interface globale

Aucune image, photo, illustration, avatar, icône figurative  
Aucun SVG décoratif  
Aucun fond illustré

L’interface globale est composée exclusivement de :

- typographie
- points
- degrés
- blocs
- couleurs
- mouvements

Les images, vidéos et films n’existent que dans les lands, espaces intérieurs privés.

### 1.2 Bicolore fonctionnel

L’UI fonctionne toujours avec deux couleurs actives.  
Les couleurs ne sont jamais décoratives.  
L’inversion n’est jamais cosmétique.

L’inversion bicolore sert à :

- révéler / camoufler
- signaler un changement d’état
- marquer un passage (extérieur ↔ intérieur)

### 1.3 Respiration & spatialité

Pas de contenu centré par défaut.  
Marges généreuses.  
Vide central assumé.  
Déséquilibre contrôlé.

Le vide est un élément actif du système.

## 2. Master Logique — bOard

### 2.1 Nature du bOard

Le bOard est :

- la zone d’entrée après création de son land
- un espace d’errance solitaire
- un lieu d’orientation, pas de décision

Le bOard n’est pas :

- un menu
- un dashboard
- une homepage classique

### 2.2 Spatialité du bOard

4 à 6 blocs maximum visibles.  
Blocs répartis sur :

- coins
- bords
- marges

Jamais parfaitement alignés.  
Centre laissé volontairement vide.

Chaque bloc est une promesse de trajectoire, pas une destination décrite.

### 2.3 Interaction

Survol : micro-respiration (variation minime de scale / contraste)  
Clic :

- le bloc grandit
- l’espace se dissout autour
- preview du chemin
- transition vers l’environnement cible

Le bOard oriente, il ne transporte pas.

## 3. Logique FERRY — voyager à plusieurs

### 3.1 Définition

Un FERRY est :

- un espace-temps partagé
- un outil de déplacement collectif
- un lieu de sociabilité temporaire

Un ferry peut mener vers :

- un événement physique
- une traversée narrative
- un lieu temporaire

### 3.2 Ferry ≠ Bateau

Le ferry :

- implique plusieurs personnes
- synchronise des présences
- suppose un embarquement commun

Ce n’est pas un simple lien.

### 3.3 UI Ferry

Pas d’image.  
Indices de présence (rythmes, pulsations, compteurs).  
Typographie plus dense.  
Sensation claire de collectif.

## 4. Logique BATEAUX — voyager seul

### 4.1 Définition

Les BATEAUX sont dédiés au voyage solitaire :

- exploration
- dérive
- quête personnelle

### 4.2 STR 3M (le stream)

Interface dédiée :

- page plein écran
- fond bicolore
- champ de points et de degrés

Chaque point possède :

- position
- angle (degré)
- phase temporelle

### 4.3 Mouvement

Mouvement de vague continue.  
Avancée lente.  
Sensation de flot.

Les utilisateurs apparaissent non pas comme images, mais comme vibrations dans le champ.

On ne voit pas les gens, on ressent leur fréquence.

## 5. Logique LAND — retour sur soi

### 5.1 Nature du land

Le land est :

- un espace personnel
- une cour intérieure
- un lieu d’édition totale

### 5.2 Inversion totale

Entrer dans son land provoque :

- une inversion complète des couleurs
- un basculement intérieur / extérieur

Comme si l’on regardait derrière soi.

### 5.3 Contenus

Le land est le seul endroit où l’utilisateur peut :

- afficher des images
- lire des films
- exposer des médias

Une plateforme d’upload est donc requise.

## 6. Haut Point — centre secret

### 6.1 Définition

Le Haut Point est situé au centre du bOard.

Invisible par défaut.  
Typographie strictement de la même couleur que le fond.  
Existant mais camouflé.

### 6.2 Révélation

Le Haut Point devient perceptible uniquement lors :

- d’une inversion bicolore
- d’un bug discret
- d’un état de quête spécifique

Le point est un lien. Mais rien ne l’indique.

### 6.3 Helm (molette)

Le centre peut ouvrir une molette pleine page (rotation + commit) et déclencher une inversion bicolore.  
La molette n’est pas un menu classique : c’est une rosace typographique, sans boutons/boîtes.

## 7. 1n1tc(o)ntact — répertoire

### 7.1 Nature

1n1tc(o)ntact n’est pas un réseau social.

C’est :

- un répertoire vivant
- une mémoire de rencontres
- une capacité à repartir ensemble

### 7.2 Fonction

Ajouter d’autres utilisateurs.  
Pas de feed.  
Pas de timeline.  
Pas d’exposition publique.

Les contacts servent principalement à :

- former des ferries
- initier des traversées collectives

## 8. État du système

À ce stade, le système comprend :

- 1 espace maître (bOard)
- 3 logiques distinctes (Ferry / Bateau / Land)
- 1 logique sociale discrète (1n1tc(o)ntact)
- 1 centre secret (Haut Point)
- 0 image dans l’UI globale

Le projet n’est pas un site. C’est un territoire navigable.

## 9. Note finale

Ce document est volontairement :

- précis
- contraignant
- non décoratif

Il protège la cohérence du système. Toute implémentation doit s’y référer.

Acté. ✅

## 10. Conventions — 0isO

À partir de maintenant :

- “Oiseau” = 0isO (nom officiel dans l’UI, les routes, le code, les prompts Codex)
- module profil : 0isO
- badge exportable : 0isO.gif (ou 0isO.apng si on ajoute plus tard)

Conventions concrètes (pour éviter toute dérive) :

- Composant : `ZeroisoModule.tsx` (ou `0isOModule.tsx` si le repo accepte ce naming)
- Engine : `zeroisoEngine.ts`
- Export : `zeroisoExportGif.ts`
- Seed : `zeroisoSeed.ts`
- Route (optionnelle) : `/u/:handle/0iso` (module intégré par défaut au profil)

## 11. Admin — Magic Link (validation)

Objectif : authentification admin via email magic link, usage unique, expirant (10–15 min), token jamais affiché.

- Endpoints
  - `POST /api/auth/admin/magic/send` `{ "email": "…" }` (anti-énumération : réponse uniforme)
  - `GET /api/auth/admin/magic/verify?token=…` (redirige ensuite vers `O_ADMIN_MAGIC_REDIRECT`, défaut `/#/admin`)
- Sécurité
  - token stocké **hashé uniquement** (sha256), invalidé si envoi échoue
  - lien lié au domaine d’émission (refus sur mauvais host)
  - session admin créée uniquement après clic valide
  - logs : `email_hash`, timestamp, `used_ip`, `used_ua`
- Références code
  - impl : `sowwwl-api-php/lib/admin-magic.php`
  - routes : `sowwwl-api-php/index.php` (section “Admin magic-link”)
  - tests : `sowwwl-api-php/tests/ADMIN_MAGIC_LINK_FLOW.md` + `sowwwl-api-php/tests/admin_magic_integration_test.php`
