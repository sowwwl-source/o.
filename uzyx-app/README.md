# O. / Uzyx webapp

Minimal Vite + React + TypeScript app (no images) with bicolour tokens, graph navigation, and a perception layer (ΔZ′).

## Run

```bash
cd uzyx-app
npm install
npm run dev
```

## Routes (hash)

- `#/HAUT` (b0ard)
- `#/LAND`
- `#/FERRY`
- `#/STR3M`
- `#/CONTACT`
- `#/u/:handle` (profil + module `0isO`)

## Controls

- `m`: molette (wheel/drag rotates, hold traverses, `Esc` closes)
- `i`: inversion (swap `--bg` / `--fg`)
- Hold `HAUT` (still) to toggle ΔZ′; exit via disorientation or returning near center

## Guardrails

- `npm run assert:ui` fails the build on forbidden UI gadgets (`<img>`, `<button>`, non-zero `border-radius`, `url(data:image/*)`).

## Tokens

- `src/theme/tokens.css` (CSS variables)
- `src/theme/invert.ts` (toggles `html[data-invert="true"]`)

## Signals (optional)

Installed globally via `src/uzyx/useUzyxSignals.ts`:
- dispatch `uzyx:create:port` or `uzyx:edit:first_b0te` on `window`
- shows a single, non-insistent `…` offer once per user (`localStorage`)
