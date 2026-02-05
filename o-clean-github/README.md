# O. — réseau minimal (clean repo)

Repo PHP simple (hébergement classique) + moteur **i appear/disappear** + édition d'œuvres ASCII **B(o)Té**.

## Pages
- `/index.php` : O. multi-blocs + i appear/disappear + O orange rare
- `/sal00ns.php` : placeholder salons
- `/p0sts.php` : placeholder posts
- `/x.php` : placeholder porte rare
- `/botes.php` : liste des B(o)Té (œuvres)
- `/bote.php?id=...` : éditeur live ASCII (doigt/souris/clavier) + scan “O” vert + inversion si orange détecté

## B(o)Té : marquer du “orange”
Dans l’éditeur, sélectionne du texte puis clique **Orange** (ou `Alt+O`).
Ça entoure la sélection avec des marqueurs :
- `⟦` et `⟧`

Le rendu transforme ces segments en **orange** (les marqueurs restent dans le texte source).

## Données
Les œuvres sont stockées en fichiers JSON dans `data/botes/`.
Aucun token / mot de passe / secret.

## Sécurité
- Pas d’upload.
- Écriture limitée au dossier `data/botes/` (id validé).
- `file_put_contents` avec `LOCK_EX`.

> Pour une vraie multi-auth + droits, on ajoutera ensuite une extension / couche identité.
