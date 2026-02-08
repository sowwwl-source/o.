/**
 * Gesture "O" — rotational inertial threshold (not geometric circle).
 *
 * API:
 *   const g = createGestureO({ onPrimed, onComplete });
 *   g.start({x,y,t});
 *   g.update({x,y,t});
 *   g.end();
 *
 * Direction:
 *   - Screen coordinates (y down): signed rotation > 0 => clockwise.
 */

export const DEFAULT_GESTURE_O = Object.freeze({
  thresholdRad: Math.PI * 2,
  primeRad: (Math.PI * 2) / 3, // ~120°
  minMovePx: 3,
  minRadiusPx: 18,
  maxStepRad: Math.PI * 0.9, // ignore jumps > ~162°
  centerLerp: 0.08, // 0..1 (toward centroid)
  speedEmaAlpha: 0.22,
  minSpeedRadPerS: 1.2,
  minConsistencyPrime: 0.78,
  minConsistencyComplete: 0.74,
  maxDurationMs: 5200,
  closureDistPx: 28,
});

export function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

export function unwrapDeltaRad(delta) {
  // Map delta to [-pi, +pi] to avoid boundary jumps.
  let d = delta;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function angleRad(center, p) {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return Math.atan2(dy, dx);
}

export function dist(center, p) {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return Math.hypot(dx, dy);
}

export function directionFromSignedRad(signedRad) {
  return signedRad >= 0 ? "cw" : "ccw";
}

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function safeNumber(n, fallback) {
  return Number.isFinite(n) ? n : fallback;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpPoint(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function createGestureO(opts = {}) {
  const cfg = { ...DEFAULT_GESTURE_O, ...(opts || {}) };

  const callbacks = {
    onPrimed: typeof cfg.onPrimed === "function" ? cfg.onPrimed : () => {},
    onComplete: typeof cfg.onComplete === "function" ? cfg.onComplete : () => {},
    onProgress: typeof cfg.onProgress === "function" ? cfg.onProgress : null,
    onDebug: typeof cfg.onDebug === "function" ? cfg.onDebug : null,
  };

  let active = false;
  let primed = false;
  let startedAt = 0;
  let lastT = 0;

  let anchor = { x: 0, y: 0 };
  let centroid = { x: 0, y: 0 };
  let center = { x: 0, y: 0 };
  let samples = 0;

  let prevPoint = null;
  let firstDir = null;
  let lastDir = null;
  let signed = 0;
  let abs = 0;
  let speedEma = 0;
  let radiusEma = 0;

  function reset() {
    active = false;
    primed = false;
    startedAt = 0;
    lastT = 0;
    samples = 0;
    prevPoint = null;
    firstDir = null;
    lastDir = null;
    signed = 0;
    abs = 0;
    speedEma = 0;
    radiusEma = 0;
  }

  function snapshot() {
    const consistency = abs > 0 ? Math.abs(signed) / abs : 0;
    const progress01 = clamp01(Math.abs(signed) / cfg.thresholdRad);
    return {
      active,
      primed,
      signedRad: signed,
      absRad: abs,
      consistency,
      progress01,
      speedRadPerS: speedEma,
      radiusPx: radiusEma,
      center: { ...center },
      anchor: { ...anchor },
      direction: directionFromSignedRad(signed),
    };
  }

  function incorporatePoint(p) {
    samples += 1;
    const inv = 1 / samples;
    centroid = { x: centroid.x * (1 - inv) + p.x * inv, y: centroid.y * (1 - inv) + p.y * inv };
    if (cfg.centerLerp > 0) center = lerpPoint(center, centroid, clamp01(cfg.centerLerp));
  }

  function start(p0) {
    const p = { x: safeNumber(p0?.x, 0), y: safeNumber(p0?.y, 0), t: safeNumber(p0?.t, nowMs()) };
    reset();
    active = true;
    startedAt = p.t;
    lastT = p.t;
    anchor = { x: p.x, y: p.y };
    centroid = { x: p.x, y: p.y };
    center = { x: p.x, y: p.y };
    samples = 1;
    prevPoint = { x: p.x, y: p.y, t: p.t };
    if (callbacks.onDebug) callbacks.onDebug({ type: "start", ...snapshot() });
  }

  function update(p1) {
    if (!active) return;
    const p = { x: safeNumber(p1?.x, 0), y: safeNumber(p1?.y, 0), t: safeNumber(p1?.t, nowMs()) };
    if (!prevPoint) {
      prevPoint = { x: p.x, y: p.y, t: p.t };
      lastT = p.t;
      incorporatePoint(p);
      return;
    }

    const age = p.t - startedAt;
    if (cfg.maxDurationMs > 0 && age > cfg.maxDurationMs) {
      // Too slow → reset silently.
      reset();
      return;
    }

    const dt = Math.max(0.001, (p.t - lastT) / 1000);
    lastT = p.t;

    incorporatePoint(p);
    const rCur = dist(center, p);
    radiusEma = radiusEma === 0 ? rCur : radiusEma * 0.85 + rCur * 0.15;

    const dx = p.x - prevPoint.x;
    const dy = p.y - prevPoint.y;
    const move = Math.hypot(dx, dy);
    if (move < cfg.minMovePx) {
      prevPoint = { x: p.x, y: p.y, t: p.t };
      if (callbacks.onDebug) callbacks.onDebug({ type: "move_skip", ...snapshot() });
      return;
    }

    const dir = Math.atan2(dy, dx);
    if (firstDir === null) firstDir = dir;

    if (lastDir !== null) {
      const d = unwrapDeltaRad(dir - lastDir);
      // Ignore discontinuities (teleport / pointer jump).
      if (Math.abs(d) <= cfg.maxStepRad) {
        signed += d;
        abs += Math.abs(d);
        const instSpeed = Math.abs(d) / dt;
        speedEma = speedEma === 0 ? instSpeed : speedEma * (1 - cfg.speedEmaAlpha) + instSpeed * cfg.speedEmaAlpha;
      } else if (callbacks.onDebug) {
        callbacks.onDebug({ type: "jump_skip", deltaRad: d, ...snapshot() });
      }
    }

    lastDir = dir;

    const s = snapshot();
    if (!primed) {
      const ok =
        Math.abs(signed) >= cfg.primeRad &&
        s.consistency >= cfg.minConsistencyPrime &&
        speedEma >= cfg.minSpeedRadPerS &&
        radiusEma >= cfg.minRadiusPx;
      if (ok) {
        primed = true;
        callbacks.onPrimed({
          direction: s.direction,
          center: s.center,
          anchor: s.anchor,
          progress01: s.progress01,
        });
      }
    }

    if (callbacks.onProgress) {
      callbacks.onProgress({
        primed,
        direction: s.direction,
        progress01: s.progress01,
        consistency: s.consistency,
        speedRadPerS: speedEma,
        center: s.center,
        anchor: s.anchor,
      });
    }

    const nearStart = Math.hypot(p.x - anchor.x, p.y - anchor.y) <= cfg.closureDistPx;
    const closureDelta =
      nearStart && firstDir !== null && lastDir !== null ? unwrapDeltaRad(firstDir - lastDir) : 0;
    const signedClosed = signed + closureDelta;

    const completeOk =
      primed &&
      Math.abs(signedClosed) >= cfg.thresholdRad &&
      s.consistency >= cfg.minConsistencyComplete &&
      speedEma >= cfg.minSpeedRadPerS;
    if (completeOk) {
      const dir = directionFromSignedRad(signedClosed);
      callbacks.onComplete(dir, {
        signedRad: signedClosed,
        consistency: s.consistency,
        speedRadPerS: speedEma,
        center: s.center,
        anchor: s.anchor,
      });
      reset();
      return;
    }

    prevPoint = { x: p.x, y: p.y, t: p.t };
    if (callbacks.onDebug) callbacks.onDebug({ type: "update", ...snapshot() });
  }

  function end() {
    if (!active) return;
    // On release, allow closure to count the last missing turn (closed loop).
    if (primed && prevPoint && firstDir !== null && lastDir !== null) {
      const nearStart = Math.hypot(prevPoint.x - anchor.x, prevPoint.y - anchor.y) <= cfg.closureDistPx;
      if (nearStart) {
        const signedClosed = signed + unwrapDeltaRad(firstDir - lastDir);
        const s = snapshot();
        const ok =
          Math.abs(signedClosed) >= cfg.thresholdRad &&
          s.consistency >= cfg.minConsistencyComplete &&
          speedEma >= cfg.minSpeedRadPerS;
        if (ok) {
          callbacks.onComplete(directionFromSignedRad(signedClosed), {
            signedRad: signedClosed,
            consistency: s.consistency,
            speedRadPerS: speedEma,
            center: s.center,
            anchor: s.anchor,
          });
        }
      }
    }
    if (callbacks.onDebug) callbacks.onDebug({ type: "end", ...snapshot() });
    reset();
  }

  return { start, update, end, snapshot };
}

export function createResonanceAudio(opts = {}) {
  const enabled = Boolean(opts?.enabled);
  if (!enabled) return null;

  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctx) return null;

  const state = {
    ctx: null,
    out: null,
    master: null,
    noise: null,
    noiseGain: null,
    hum: null,
    humGain: null,
    delay: null,
    delayFb: null,
    delayMix: null,
    running: false,
  };

  function ensure() {
    if (state.ctx) return;
    const ctx = new Ctx();
    state.ctx = ctx;

    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(ctx.destination);
    state.out = out;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(out);
    state.master = master;

    // Reverb-ish: tiny delay + feedback (very subtle).
    const delay = ctx.createDelay(0.25);
    delay.delayTime.value = 0.085;
    const fb = ctx.createGain();
    fb.gain.value = 0.18;
    delay.connect(fb);
    fb.connect(delay);
    const mix = ctx.createGain();
    mix.gain.value = 0.25;
    delay.connect(mix);
    mix.connect(master);
    state.delay = delay;
    state.delayFb = fb;
    state.delayMix = mix;

    // Noise bed (grain)
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.35;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 140;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;

    const ng = ctx.createGain();
    ng.gain.value = 0.0;

    src.connect(hp);
    hp.connect(lp);
    lp.connect(ng);
    ng.connect(master);
    ng.connect(delay);

    state.noise = src;
    state.noiseGain = ng;

    // Hum (nappe)
    const hum = ctx.createOscillator();
    hum.type = "sine";
    hum.frequency.value = 62;
    const hg = ctx.createGain();
    hg.gain.value = 0.0;
    hum.connect(hg);
    hg.connect(master);
    hg.connect(delay);
    state.hum = hum;
    state.humGain = hg;

    src.start();
    hum.start();
  }

  async function arm() {
    ensure();
    if (!state.ctx) return;
    try {
      if (state.ctx.state !== "running") await state.ctx.resume();
    } catch {}
  }

  function setIntensity(x) {
    if (!state.ctx || !state.master || !state.noiseGain || !state.humGain) return;
    const v = clamp01(x);
    // Keep very low amplitude. This is a hint, not a feature.
    const master = v * 0.05;
    const noise = v * 0.028;
    const hum = v * 0.020;
    const t = state.ctx.currentTime;
    state.master.gain.cancelScheduledValues(t);
    state.master.gain.setTargetAtTime(master, t, 0.035);
    state.noiseGain.gain.cancelScheduledValues(t);
    state.noiseGain.gain.setTargetAtTime(noise, t, 0.035);
    state.humGain.gain.cancelScheduledValues(t);
    state.humGain.gain.setTargetAtTime(hum, t, 0.035);
  }

  function stop() {
    if (!state.ctx || !state.master) return;
    setIntensity(0);
  }

  return { arm, setIntensity, stop };
}

// Browser bridge (optional)
try {
  const g = globalThis;
  g.O = g.O || {};
  g.O.gestureO = g.O.gestureO || {};
  g.O.gestureO.createGestureO = createGestureO;
  g.O.gestureO.createResonanceAudio = createResonanceAudio;
  g.O.gestureO.DEFAULT_GESTURE_O = DEFAULT_GESTURE_O;
} catch {}
