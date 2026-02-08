import './style.css';

import * as THREE from 'three';
import { createScene } from './social/scene';
import { DoorsSystem } from './social/doors';
import { placeUsers } from './social/placement';
import { AudioAura } from './social/audioAura';
import { StabilityEngine } from './social/readability';
import { SocialStateMachine } from './social/stateMachine';
import { fetchUsers, sendKnock, type UserPublic } from './social/users';
import { createOverlay } from './ui/overlay';

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function fmtTz(minutes: number) {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return mm ? `UTC${sign}${hh}:${String(mm).padStart(2, '0')}` : `UTC${sign}${hh}`;
}

async function main() {
  const mount = document.querySelector('#app');
  if (!(mount instanceof HTMLElement)) throw new Error('Missing #app mount');

  const scene = createScene(mount);
  const overlay = createOverlay(mount);

  overlay.setStats('loading…');
  overlay.setFocus('—', 0, 1);
  overlay.setStability(0.35);

  const audioAura = new AudioAura();
  const stability = new StabilityEngine();

  let audioOn = false;
  overlay.setAudioState(audioOn);
  overlay.onAudioToggle(async () => {
    audioOn = !audioOn;
    overlay.setAudioState(audioOn);
    if (audioOn) await audioAura.unlock();
  });

  const users = await fetchUsers();
  overlay.setStats(`${users.length} D0RS  •  drag orbit  •  click knock`);

  const placed = placeUsers(users, scene.surfaceMesh, {
    radius: 160,
    minDistance: 12,
    relaxIterations: 8,
    zoneLonStepDeg: 30,
  });

  const positions = new Map<string, THREE.Vector3>();
  placed.forEach((p) => positions.set(p.userId, p.pos));

  const stateMachine = new SocialStateMachine(overlay, users);
  overlay.onAction((id) => stateMachine.act(id));

  let hoveredUser: UserPublic | null = null;

  const doors = new DoorsSystem({
    users,
    positions,
    scene: scene.scene,
    camera: scene.camera,
    dom: scene.renderer.domElement,
    events: {
      onHover: (u) => {
        hoveredUser = u;
      },
      onKnock: (u) => {
        (async () => {
          if (!audioOn) {
            audioOn = true;
            overlay.setAudioState(true);
          }
          await audioAura.unlock();
          audioAura.playKnock();
          void sendKnock(u.id);
          stateMachine.knock(u.id);
        })();
      },
    },
  });

  // Motion sources
  let pointerMotion = 0;
  let deviceMotion = 0;

  {
    const el = scene.renderer.domElement;
    let px = 0;
    let py = 0;
    let pt = performance.now();

    el.addEventListener(
      'pointermove',
      (e) => {
        const now = performance.now();
        const dt = Math.max(1, now - pt);
        const dx = e.clientX - px;
        const dy = e.clientY - py;
        const speed = Math.hypot(dx, dy) / dt; // px per ms
        pointerMotion = clamp(speed * 1.25, 0, 2);
        px = e.clientX;
        py = e.clientY;
        pt = now;
      },
      { passive: true },
    );
  }

  if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
    // No permission prompts here; if a platform blocks motion, we fall back to camera/pointer motion.
    window.addEventListener(
      'devicemotion',
      (e) => {
        const a = e.accelerationIncludingGravity || e.acceleration;
        const ar = e.rotationRate;
        const acc = a ? Math.hypot(a.x || 0, a.y || 0, a.z || 0) : 0;
        const rot = ar ? Math.hypot(ar.alpha || 0, ar.beta || 0, ar.gamma || 0) : 0;
        // Normalize into a compact 0..~2 range.
        deviceMotion = clamp(acc / 28 + rot / 420, 0, 2);
      },
      { passive: true },
    );
  }

  // Camera motion proxy
  const prevCamPos = new THREE.Vector3().copy(scene.camera.position);
  const prevCamQuat = new THREE.Quaternion().copy(scene.camera.quaternion);

  let lastMs = performance.now();
  function frame(nowMs: number) {
    const dt = Math.min(0.05, Math.max(0, (nowMs - lastMs) / 1000));
    lastMs = nowMs;

    // decay transient inputs
    pointerMotion *= Math.exp(-dt * 2.8);
    deviceMotion *= Math.exp(-dt * 2.2);

    const posDelta = scene.camera.position.distanceTo(prevCamPos);
    const rotDelta = prevCamQuat.angleTo(scene.camera.quaternion);
    prevCamPos.copy(scene.camera.position);
    prevCamQuat.copy(scene.camera.quaternion);

    const cameraMotion = clamp(posDelta / 6 + rotDelta / 0.03, 0, 2);
    const s = stability.update(dt, { cameraMotion, pointerMotion, deviceMotion });
    overlay.setStability(s);

    // Focus: hovered door wins; else nearest door (helps mobile/no-hover).
    const camPos = scene.camera.position;
    const hover = doors.getHoveredUser();
    const focusUser = hover || hoveredUser;

    let focus: { user: UserPublic; distance: number; hovered: boolean } | null = null;

    if (focusUser) {
      const p = positions.get(focusUser.id);
      if (p) focus = { user: focusUser, distance: camPos.distanceTo(p), hovered: Boolean(hover) };
    } else {
      let best: { user: UserPublic; distance: number; hovered: boolean } | null = null;
      for (const u of users) {
        const p = positions.get(u.id);
        if (!p) continue;
        const d = camPos.distanceTo(p);
        if (!best || d < best.distance) best = { user: u, distance: d, hovered: false };
      }
      if (best && best.distance < 240) focus = best;
    }

    if (focus) {
      const u = focus.user;
      const text = `D0RS: ${u.publicCourName}  •  ${fmtTz(u.tzOffsetMinutes)}  •  lat:${u.latBucket}  lon:${u.lonBucket}  •  ${u.presence}`;
      overlay.setFocus(text, s, u.soundAura.seed || 1);
    } else {
      overlay.setFocus('—', s, 1);
    }

    if (audioAura.isUnlocked()) {
      if (audioOn) audioAura.update(focus, nowMs);
      else audioAura.update(null, nowMs);
    }

    doors.update(nowMs);
    scene.update(dt);
    scene.renderer.render(scene.scene, scene.camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  const mount = document.querySelector('#app');
  if (mount instanceof HTMLElement) {
    mount.innerHTML = `<pre style=\"padding:16px;color:#eed8dd\">social3d error: ${String(err?.message || err)}</pre>`;
  }
});

