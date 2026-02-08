# social3d — D0RS / COUR / SALOON (mock)

Minimal Vite + TypeScript + Three.js scene for the O./Sowwwl "social 3D" concept:
- Durer-like wire polyhedron
- ~120 mock D0RS (doors) placed privacy-safe (tz + lat/lon buckets + jitter + anti-stack)
- Stability/readability: motion => `I`, stillness => readable
- WebAudio aura + knock "toc"
- Mock state machine: D0RS -> COUR / SALOON / FILES

## Run

```bash
cd social3d
npm install
npm run dev
```

Then open Vite (default `http://localhost:5173`).

## Controls

- Drag: orbit
- Wheel / trackpad: zoom
- Hover a door: focus label (obeys stability engine)
- Click a door: knock + overlay actions
- `Enter`: knock focused door
- `Esc`: clear focus
- `audio: on/off` (HUD): toggles aura (knock enables audio automatically)

## Notes

- Mock "backend" is local: `src/social/users.ts` serves `/api/users` from `src/mock/users.json`.
- Device motion is used when available; platforms that require permission will fall back to camera/pointer motion.

