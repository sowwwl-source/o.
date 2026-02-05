# ÉTAT DU PROJET (PAUSE) - 4 Février 2026

## Résumé
Le projet `O_installation_FRESH` contient désormais la fusion des fonctionnalités "Réseau Social" (feed, posts) provenant de `sowwwl.com_network`.

## Ce qui a été fait
1.  **Base de données** : Les tables `posts`, `connections`, et `login_attempts` ont été ajoutées au fichier `init.sql`.
2.  **Backend** :
    - `auth.php` modifié pour gérer la session `user_id`.
    - `feed.php` et `post.php` créés et adaptés pour O.
    - `includes/` créé pour la compatibilité.
3.  **Frontend** :
    - Assets déplacés dans `sowwwl_assets/`.
    - Lien "Accéder au Flux" ajouté sur le Dashboard (`land.php`).

## Problèmes connus (à régler à la reprise)
1.  **Docker** : Docker n'était pas lancé/installé sur la machine actuelle. Impossible de tester le build localement.
2.  **Déploiement** : La configuration `netlify.toml` est en mode "Hybride". Elle nécessite un serveur PHP séparé (VPS, Heroku, Railway) pour fonctionner réellement.

## Comment reprendre
1.  Installer et lancer Docker Desktop.
2.  Dans ce dossier, lancer : `docker compose up -d --build`.
3.  Accéder à `http://localhost:8080`.
