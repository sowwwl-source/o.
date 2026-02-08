import type { AuraType, Presence, UserPublic } from './users';

type FocusInfo = {
  user: UserPublic;
  distance: number;
  hovered: boolean;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function presenceGain(p: Presence) {
  if (p === 'present') return 1.0;
  if (p === 'idle') return 0.55;
  return 0.18;
}

function seeded01(seed: number) {
  // tiny deterministic PRNG for click timing
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class AudioAura {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lp: BiquadFilterNode | null = null;

  private noiseSrc: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;

  private humOsc: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private humLfo: OscillatorNode | null = null;
  private humLfoGain: GainNode | null = null;

  private unlocked = false;
  private lastFocusId = '';
  private nextClickAt = 0;
  private clickRand = seeded01(1);

  isUnlocked() {
    return this.unlocked;
  }

  async unlock() {
    if (this.unlocked) return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;

    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;

    this.lp = this.ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 600;
    this.lp.Q.value = 0.7;

    this.master.connect(this.lp);
    this.lp.connect(this.ctx.destination);

    // Noise bed
    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0.0;
    this.noiseGain.connect(this.master);

    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * 0.35;
    this.noiseSrc = this.ctx.createBufferSource();
    this.noiseSrc.buffer = buffer;
    this.noiseSrc.loop = true;
    this.noiseSrc.connect(this.noiseGain);
    this.noiseSrc.start();

    // Hum
    this.humGain = this.ctx.createGain();
    this.humGain.gain.value = 0.0;
    this.humGain.connect(this.master);
    this.humOsc = this.ctx.createOscillator();
    this.humOsc.type = 'sine';
    this.humOsc.frequency.value = 110;
    this.humOsc.connect(this.humGain);

    this.humLfo = this.ctx.createOscillator();
    this.humLfo.type = 'sine';
    this.humLfo.frequency.value = 0.08;
    this.humLfoGain = this.ctx.createGain();
    this.humLfoGain.gain.value = 5;
    this.humLfo.connect(this.humLfoGain);
    this.humLfoGain.connect(this.humOsc.frequency);

    this.humOsc.start();
    this.humLfo.start();

    this.unlocked = true;
    try {
      await this.ctx.resume();
    } catch {}
  }

  private setType(type: AuraType, volume: number, seed: number) {
    if (!this.ctx || !this.master || !this.lp || !this.noiseGain || !this.humGain || !this.humOsc) return;

    const t = this.ctx.currentTime;
    const v = clamp(volume, 0, 1);

    // Master soft approach
    this.master.gain.setTargetAtTime(v, t, 0.06);

    // Type mix
    const noise = type === 'noise' ? v * 0.55 : type === 'click' ? v * 0.10 : 0.0;
    const hum = type === 'hum' ? v * 0.32 : 0.0;
    this.noiseGain.gain.setTargetAtTime(noise, t, 0.08);
    this.humGain.gain.setTargetAtTime(hum, t, 0.10);

    // Seeded hum frequency
    if (type === 'hum') {
      const base = 72 + (seed % 80);
      this.humOsc.frequency.setTargetAtTime(base, t, 0.4);
    }
  }

  private maybeClick(type: AuraType, presence: Presence, volume: number, seed: number, nowMs: number) {
    if (!this.ctx) return;
    if (type !== 'click') return;
    if (volume <= 0.01) return;

    // Update RNG per focus change.
    if (this.lastFocusId !== String(seed)) {
      this.clickRand = seeded01(seed ^ 0x9e3779b9);
      this.nextClickAt = 0;
      this.lastFocusId = String(seed);
    }

    const base = presence === 'present' ? 1200 : presence === 'idle' ? 1800 : 2600;
    const jitter = 1400 * this.clickRand();
    const interval = base + jitter;

    if (this.nextClickAt === 0) this.nextClickAt = nowMs + interval;
    if (nowMs < this.nextClickAt) return;
    this.nextClickAt = nowMs + interval;
    this.playTick(volume * 0.55);
  }

  private playTick(level: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    g.connect(this.master);

    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 820;
    o.connect(g);

    const v = clamp(level, 0, 1) * 0.7;
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.032);
    o.start(t);
    o.stop(t + 0.04);
  }

  playKnock() {
    // Short "toc" (always allowed even if aura is silence).
    this.playTick(0.9);
  }

  update(focus: FocusInfo | null, nowMs: number) {
    if (!this.ctx || !this.master || !this.lp) return;

    const t = this.ctx.currentTime;

    if (!focus) {
      this.master.gain.setTargetAtTime(0.0, t, 0.12);
      return;
    }

    const { user, distance } = focus;
    const d = Math.max(0, distance);
    const near = 58;
    const far = 240;
    const v = smoothstep(far, near, d);
    const pv = v * presenceGain(user.presence);

    // Muffle with distance.
    const cutoff = 280 + smoothstep(far, near, d) * 2600;
    this.lp.frequency.setTargetAtTime(cutoff, t, 0.14);

    this.setType(user.soundAura.type, pv, user.soundAura.seed);
    this.maybeClick(user.soundAura.type, user.presence, pv, user.soundAura.seed, nowMs);
  }
}

