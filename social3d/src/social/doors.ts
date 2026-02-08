import * as THREE from 'three';
import type { DoorState, UserPublic } from './users';

type DoorEvents = {
  onHover: (user: UserPublic | null) => void;
  onKnock: (user: UserPublic) => void;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export class DoorsSystem {
  private readonly users: UserPublic[];
  private readonly byIndex: UserPublic[];
  private readonly state = new Map<string, DoorState>();

  private readonly mesh: THREE.InstancedMesh;
  private readonly baseMatrices: THREE.Matrix4[] = [];
  private readonly baseScales: number[] = [];
  private readonly colors: THREE.Color[] = [];

  private hoveredIndex: number | null = null;
  private focusedIndex: number | null = null;
  private lastKnockAt = new Map<string, number>();

  private readonly ray = new THREE.Raycaster();
  private readonly mouse = new THREE.Vector2();

  private readonly dom: HTMLElement;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly events: DoorEvents;

  constructor(params: {
    users: UserPublic[];
    positions: Map<string, THREE.Vector3>;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    dom: HTMLElement;
    events: DoorEvents;
  }) {
    this.users = params.users;
    this.byIndex = params.users.slice();
    this.dom = params.dom;
    this.camera = params.camera;
    this.events = params.events;

    const geo = new THREE.OctahedronGeometry(2.2, 0);
    const mat = new THREE.MeshBasicMaterial({
      wireframe: true,
      transparent: true,
      opacity: 0.85,
      vertexColors: true,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, this.byIndex.length);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    params.scene.add(this.mesh);

    const tmp = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const s = new THREE.Vector3();
    const q = new THREE.Quaternion();

    this.byIndex.forEach((u, i) => {
      const p = params.positions.get(u.id) || new THREE.Vector3();
      pos.copy(p);

      const seed = Math.floor((u.soundAura.seed || 1) % 1000);
      const scale = 0.9 + (seed % 7) * 0.03;
      s.setScalar(scale);
      tmp.compose(pos, q, s);

      this.baseMatrices[i] = tmp.clone();
      this.baseScales[i] = scale;
      this.mesh.setMatrixAt(i, tmp);

      const c = this.colorForPresence(u.presence);
      this.colors[i] = c.clone();
      this.mesh.setColorAt(i, c);

      this.state.set(u.id, { hovered: false, knocked: false });
    });

    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;

    this.dom.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.dom.addEventListener('pointerleave', () => this.setHovered(null));
    this.dom.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.focusedIndex !== null) {
        const u = this.byIndex[this.focusedIndex];
        if (u) this.knock(u);
      }
      if (e.key === 'Escape') this.focusedIndex = null;
    });
  }

  getMesh() {
    return this.mesh;
  }

  getHoveredUser(): UserPublic | null {
    if (this.hoveredIndex === null) return null;
    return this.byIndex[this.hoveredIndex] || null;
  }

  getFocusUser(): UserPublic | null {
    if (this.focusedIndex === null) return null;
    return this.byIndex[this.focusedIndex] || null;
  }

  getUserState(userId: string): DoorState {
    return this.state.get(userId) || { hovered: false, knocked: false };
  }

  private colorForPresence(p: UserPublic['presence']) {
    if (p === 'present') return new THREE.Color(0x78ffc8);
    if (p === 'idle') return new THREE.Color(0xeed8b0);
    return new THREE.Color(0x7a7f7d);
  }

  private onPointerMove(e: PointerEvent) {
    const r = this.dom.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    this.mouse.set(x, y);
    this.ray.setFromCamera(this.mouse, this.camera);
    const hits = this.ray.intersectObject(this.mesh, false);
    if (!hits.length) return this.setHovered(null);
    const inst = hits[0].instanceId;
    if (typeof inst !== 'number') return this.setHovered(null);
    this.setHovered(inst);
  }

  private onClick(_e: MouseEvent) {
    if (this.hoveredIndex === null) return;
    const u = this.byIndex[this.hoveredIndex];
    if (!u) return;
    this.focusedIndex = this.hoveredIndex;
    this.knock(u);
  }

  private setHovered(index: number | null) {
    if (this.hoveredIndex === index) return;

    const prev = this.hoveredIndex;
    this.hoveredIndex = index;

    if (typeof prev === 'number') {
      const u = this.byIndex[prev];
      if (u) {
        const st = this.state.get(u.id);
        if (st) st.hovered = false;
        this.mesh.setColorAt(prev, this.colors[prev]);
      }
    }

    if (typeof index === 'number') {
      const u = this.byIndex[index];
      if (u) {
        const st = this.state.get(u.id);
        if (st) st.hovered = true;
        this.mesh.setColorAt(index, new THREE.Color(0xffffff));
        this.events.onHover(u);
      }
    } else {
      this.events.onHover(null);
    }

    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private knock(u: UserPublic) {
    const now = Date.now();
    const last = this.lastKnockAt.get(u.id) || 0;
    if (now - last < 5000) return;
    this.lastKnockAt.set(u.id, now);

    const st = this.state.get(u.id);
    if (st) {
      st.knocked = true;
      st.lastKnockAt = now;
    }
    this.events.onKnock(u);
  }

  update(timeMs: number) {
    // Subtle pulsation + knock cooldown tint.
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();

    for (let i = 0; i < this.byIndex.length; i++) {
      const base = this.baseMatrices[i];
      base.decompose(pos, q, scl);

      const u = this.byIndex[i];
      const seed = (u.soundAura.seed || 1) % 97;
      const t = timeMs * 0.001;
      const pulse = 1 + Math.sin(t * (0.8 + (seed % 5) * 0.07) + seed) * 0.08;

      const st = this.state.get(u.id);
      const knockedAt = st?.lastKnockAt || 0;
      const knockT = knockedAt ? clamp((timeMs - knockedAt) / 5000, 0, 1) : 1;
      const knockGlow = 1 - knockT;

      const scale = this.baseScales[i] * pulse * (1 + knockGlow * 0.22);
      const m = new THREE.Matrix4();
      m.compose(pos, q, scl.setScalar(scale));
      this.mesh.setMatrixAt(i, m);

      if (knockGlow > 0.001 && this.hoveredIndex !== i) {
        const c = new THREE.Color(0xfeedc9).lerp(this.colors[i], 1 - knockGlow);
        this.mesh.setColorAt(i, c);
      } else if (this.hoveredIndex !== i) {
        this.mesh.setColorAt(i, this.colors[i]);
      }
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

