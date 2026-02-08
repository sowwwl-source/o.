# 0isO (module profil)

## Contrat

- UI globale : **zéro image** (aucun `<img>`, aucune URL `background-image: url(...)`).
- Rendu écran : **texte/ASCII uniquement**, monospace, bicolore (`--bg` / `--fg`).
- Les scans servent uniquement d’**input en mémoire** pour produire une **matrice de densité** (luminance → 0..1), puis sont libérés.

## Pipeline (densité → ASCII)

1. Seed publique (handle / SSH key publique) → champ de densité génératif.
2. (Option) Scan(s) → densité (canvas en mémoire, jamais affiché).
3. Densité + fragments → grille ASCII fixe :
   - fond : rampe de densité (`charset.ramp`)
   - “encre” : fragments textuels qui se plient au champ
4. Au repos : micro-shift (lignes décalées lentement).

Fichiers :
- `ZeroisoModule.tsx` : UI + contrôles typographiques
- `zeroisoEngine.ts` : densité + frames ASCII
- `zeroisoExportGif.ts` : frames → GIF (local)
- `zeroisoSeed.ts` : seed publique (SHA-256)

## Export GIF (local)

- Le module n’affiche jamais le GIF (pas d’aperçu).
- Export : rasterisation **hors DOM** (canvas en mémoire si dispo, fallback sinon) → GIF bicolore.
- Statut texte : `GIF prêt: <n> frames / <fps>fps` + lien de téléchargement `0isO.gif`.

## Seed publique (crypto-friendly)

- `seedFromHandle(handle, timestamp)` : SHA-256 → seed courte.
- `seedFromSshPublicKey(pubkey)` : SHA-256 → seed courte.
- **Jamais** de clés privées (refus explicite).

