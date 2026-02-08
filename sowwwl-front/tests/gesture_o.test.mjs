import test from "node:test";
import assert from "node:assert/strict";

import { createGestureO, directionFromSignedRad, unwrapDeltaRad } from "../assets/js/gesture-o.mjs";

test("unwrapDeltaRad keeps deltas within [-pi, pi]", () => {
  const deg = (d) => (d * Math.PI) / 180;
  // 179 -> -179 should be +2°, not -358°
  const d = unwrapDeltaRad(deg(-179) - deg(179));
  assert.ok(Math.abs(d - deg(2)) < deg(0.001));
});

test("directionFromSignedRad: screen coords map + to cw", () => {
  assert.equal(directionFromSignedRad(0.1), "cw");
  assert.equal(directionFromSignedRad(-0.1), "ccw");
});

test("gesture O completes clockwise", () => {
  let primed = 0;
  let complete = null;

  const g = createGestureO({
    centerLerp: 0.22,
    minRadiusPx: 1,
    minSpeedRadPerS: 0.01,
    maxDurationMs: 999999,
    onPrimed: () => primed++,
    onComplete: (dir) => {
      complete = dir;
    },
  });

  const cx = 100;
  const cy = 100;
  const r = 40;
  const steps = 48;
  const dt = 16;

  function pt(i) {
    const a = (i / steps) * Math.PI * 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }

  g.start({ ...pt(0), t: 0 });
  for (let i = 1; i <= steps; i += 1) g.update({ ...pt(i), t: i * dt });
  g.end();

  assert.ok(primed >= 1);
  assert.equal(complete, "cw");
});

test("gesture O completes counter-clockwise", () => {
  let complete = null;

  const g = createGestureO({
    centerLerp: 0.22,
    minRadiusPx: 1,
    minSpeedRadPerS: 0.01,
    maxDurationMs: 999999,
    onComplete: (dir) => {
      complete = dir;
    },
  });

  const cx = 0;
  const cy = 0;
  const r = 30;
  const steps = 40;
  const dt = 16;

  function pt(i) {
    const a = (-i / steps) * Math.PI * 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }

  g.start({ ...pt(0), t: 0 });
  for (let i = 1; i <= steps; i += 1) g.update({ ...pt(i), t: i * dt });
  g.end();

  assert.equal(complete, "ccw");
});

test("gesture O ignores straight drags", () => {
  let primed = false;
  let complete = false;

  const g = createGestureO({
    centerLerp: 0,
    minRadiusPx: 1,
    minSpeedRadPerS: 0.01,
    maxDurationMs: 999999,
    onPrimed: () => {
      primed = true;
    },
    onComplete: () => {
      complete = true;
    },
  });

  g.start({ x: 0, y: 0, t: 0 });
  for (let i = 1; i <= 40; i += 1) g.update({ x: i * 3, y: 0, t: i * 16 });
  g.end();

  assert.equal(primed, false);
  assert.equal(complete, false);
});
