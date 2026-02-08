import * as THREE from 'three';
import type { UserPublic } from './users';

export type PlacementOptions = {
  radius: number;
  minDistance: number;
  relaxIterations: number;
  zoneLonStepDeg: number;
};

export type PlacedDoor = {
  userId: string;
  dir: THREE.Vector3;
  pos: THREE.Vector3;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function wrapDeg(x: number) {
  let v = x;
  while (v <= -180) v += 360;
  while (v > 180) v -= 360;
  return v;
}

function degToRad(d: number) {
  return (d * Math.PI) / 180;
}

export function hash01(input: string): number {
  // FNV-1a-ish stable hash -> 0..1
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function jitter(id: string, salt: string, ampDeg: number) {
  return (hash01(`${id}|${salt}`) * 2 - 1) * ampDeg;
}

export function userDirection(u: UserPublic): THREE.Vector3 {
  const id = u.id;
  const tzHours = clamp(u.tzOffsetMinutes / 60, -12, 14);
  const lonFromTz = tzHours * 15;

  // Prefer lonBucket (privacy-safe), but nudge toward tz-derived sector.
  const lonBase = Number.isFinite(u.lonBucket) ? u.lonBucket : lonFromTz;
  const lon = wrapDeg(lonBase * 0.7 + lonFromTz * 0.3 + jitter(id, 'lon', 10));

  const latBase = Number.isFinite(u.latBucket) ? u.latBucket : (jitter(id, 'latBase', 60) / 2);
  const lat = clamp(latBase + jitter(id, 'lat', 8), -80, 80);

  const latR = degToRad(lat);
  const lonR = degToRad(lon);

  const cp = Math.cos(latR);
  return new THREE.Vector3(
    cp * Math.cos(lonR),
    Math.sin(latR),
    cp * Math.sin(lonR),
  ).normalize();
}

export function snapDirectionToMesh(dir: THREE.Vector3, mesh: THREE.Mesh, fallbackRadius: number): THREE.Vector3 {
  const ray = new THREE.Raycaster();
  const origin = new THREE.Vector3(0, 0, 0);
  ray.set(origin, dir.clone().normalize());
  mesh.updateMatrixWorld(true);
  const hits = ray.intersectObject(mesh, false);
  if (hits.length) return hits[0].point.clone();
  return dir.clone().normalize().multiplyScalar(fallbackRadius);
}

function zoneKey(u: UserPublic, zoneLonStepDeg: number) {
  const tzHours = clamp(u.tzOffsetMinutes / 60, -12, 14);
  const lonFromTz = tzHours * 15;
  const lonZone = Math.round(lonFromTz / zoneLonStepDeg) * zoneLonStepDeg;
  return `${u.latBucket}|${lonZone}`;
}

export function placeUsers(users: UserPublic[], surfaceMesh: THREE.Mesh, opts: PlacementOptions): PlacedDoor[] {
  const {
    radius,
    minDistance,
    relaxIterations,
    zoneLonStepDeg,
  } = opts;

  const dirs = new Map<string, THREE.Vector3>();
  const zones = new Map<string, string[]>();

  users.forEach((u) => {
    const d = userDirection(u);
    dirs.set(u.id, d);
    const key = zoneKey(u, zoneLonStepDeg);
    const arr = zones.get(key) || [];
    arr.push(u.id);
    zones.set(key, arr);
  });

  const minDirDist = minDistance / Math.max(1, radius);

  // Simple repulsion in "zone" to avoid stacks. Operates on sphere directions; snap later.
  for (let iter = 0; iter < relaxIterations; iter++) {
    for (const ids of zones.values()) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const aId = ids[i];
          const bId = ids[j];
          const a = dirs.get(aId);
          const b = dirs.get(bId);
          if (!a || !b) continue;

          const dist = a.distanceTo(b);
          if (dist >= minDirDist) continue;

          const push = a.clone().sub(b);
          const len = push.length();
          if (len < 1e-6) continue;
          push.multiplyScalar(1 / len);

          const overlap = (minDirDist - dist) * 0.52;
          a.addScaledVector(push, overlap);
          b.addScaledVector(push, -overlap);

          a.normalize();
          b.normalize();
        }
      }
    }
  }

  const placed: PlacedDoor[] = [];
  users.forEach((u) => {
    const dir = dirs.get(u.id) || userDirection(u);
    const pos = snapDirectionToMesh(dir, surfaceMesh, radius);
    placed.push({ userId: u.id, dir: dir.clone(), pos });
  });

  return placed;
}

