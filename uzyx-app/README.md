# O. / Uzyx minimal webapp

Minimal TypeScript + Vite app with a bicolour design system.

## Run

```bash
cd uzyx-app
npm install
npm run dev
```

## Tokens and inversion

- Tokens live in `src/tokens.ts`.
- `applyTokens()` maps tokens to CSS variables.
- `toggleInvert()` toggles `.is-inverted` on `html`, which swaps `--bg` and `--fg` (and related variables).
- Inversion is triggered by click on `[data-invert]` and key `i`.

## Styles

Global styles and reset are in `src/styles.css`:
- accessible focus states
- generous spacing
- prefers-reduced-motion support
