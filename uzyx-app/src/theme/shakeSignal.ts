type Opts = {
  ttlMs?: number;
  cooldownMs?: number;
};

type Vec3 = { x: number; y: number; z: number; has: boolean };

function nowMs(): number {
  return Date.now();
}

function clamp(n: number, a: number, b: number): number {
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}

function readAccel(e: DeviceMotionEvent): { x: number; y: number; z: number } | null {
  const a = e.accelerationIncludingGravity ?? e.acceleration;
  if (!a) return null;
  const x = typeof a.x === "number" && Number.isFinite(a.x) ? a.x : 0;
  const y = typeof a.y === "number" && Number.isFinite(a.y) ? a.y : 0;
  const z = typeof a.z === "number" && Number.isFinite(a.z) ? a.z : 0;
  return { x, y, z };
}

export function installShakeSignal(opts: Opts = {}): () => void {
  if (typeof window === "undefined") return () => {};

  const ttlMs = clamp(opts.ttlMs ?? 1200, 300, 6000);
  const cooldownMs = clamp(opts.cooldownMs ?? 2400, 600, 12000);

  const root = document.documentElement;
  let signalTimer: number | null = null;
  let lastFire = 0;

  let energy = 0;
  const last: Vec3 = { x: 0, y: 0, z: 0, has: false };

  const fire = () => {
    const t = nowMs();
    if (t - lastFire < cooldownMs) return;
    lastFire = t;
    root.dataset.signal = "true";
    if (signalTimer !== null) window.clearTimeout(signalTimer);
    signalTimer = window.setTimeout(() => {
      signalTimer = null;
      delete root.dataset.signal;
    }, ttlMs);
  };

  const onMotion = (e: DeviceMotionEvent) => {
    const a = readAccel(e);
    if (!a) return;

    if (!last.has) {
      last.x = a.x;
      last.y = a.y;
      last.z = a.z;
      last.has = true;
      return;
    }

    const dx = a.x - last.x;
    const dy = a.y - last.y;
    const dz = a.z - last.z;
    last.x = a.x;
    last.y = a.y;
    last.z = a.z;

    const delta = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
    energy = energy * 0.86 + delta * 0.74;

    // Tuned to avoid triggering on small handset movements.
    if (energy > 26) {
      energy = 0;
      fire();
    }
  };

  let active = false;
  const start = () => {
    if (active) return;
    active = true;
    window.addEventListener("devicemotion", onMotion, { passive: true });
  };

  const stop = () => {
    if (!active) return;
    active = false;
    window.removeEventListener("devicemotion", onMotion as any);
  };

  const requestIfNeeded = () => {
    const DME = (window as any).DeviceMotionEvent as any;
    const canRequest = DME && typeof DME.requestPermission === "function";
    if (!canRequest) {
      start();
      return;
    }

    const onFirstGesture = async () => {
      window.removeEventListener("pointerdown", onFirstGesture as any);
      try {
        const res = await DME.requestPermission();
        if (res === "granted") start();
      } catch {
        // ignore
      }
    };

    // Best-effort: no UI, no retry loops.
    window.addEventListener("pointerdown", onFirstGesture as any, { passive: true, once: true } as any);
  };

  requestIfNeeded();

  return () => {
    stop();
    if (signalTimer !== null) window.clearTimeout(signalTimer);
    delete root.dataset.signal;
  };
}

