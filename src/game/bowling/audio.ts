/** Synthesised alley sounds (Web Audio, no audio files): rolling rumble and pin crash. */
export class AlleyAudio {
  private ctx: AudioContext | null = null;
  private rumble: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  enabled = true;

  private ensure(): AudioContext | null {
    if (!this.enabled || typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private noise(ctx: AudioContext, seconds: number) {
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; // brown-ish noise
      d[i] = last * 6;
    }
    return buf;
  }

  startRoll() {
    const ctx = this.ensure();
    if (!ctx) return;
    this.stopRoll();
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx, 4);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 180;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 0.25);
    src.connect(lp).connect(gain).connect(ctx.destination);
    src.start();
    this.rumble = { src, gain };
  }

  stopRoll() {
    if (!this.rumble || !this.ctx) return;
    const { src, gain } = this.rumble;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    src.stop(this.ctx.currentTime + 0.4);
    this.rumble = null;
  }

  crash(intensity = 1) {
    const ctx = this.ensure();
    if (!ctx) return;
    this.stopRoll();
    const t = ctx.currentTime;
    // A burst of short wooden "clacks" plus a noisy crash.
    const hits = Math.round(4 + intensity * 10);
    for (let i = 0; i < hits; i++) {
      const at = t + Math.random() * 0.35 * intensity;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(700 + Math.random() * 900, at);
      osc.frequency.exponentialRampToValueAtTime(220, at + 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.25 * intensity, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
      osc.connect(g).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.15);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx, 0.8);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * intensity, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
  }

  /** Crowd applause and cheers: many short filtered claps plus a rising "woo". */
  applause(level: number) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.05;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1700;
    bp.Q.value = 0.6;
    const master = ctx.createGain();
    master.gain.value = 0.05 + 0.08 * level;
    bp.connect(master).connect(ctx.destination);
    const claps = Math.round(50 + 170 * level), dur = 1.4 + 2 * level;
    for (let i = 0; i < claps; i++) {
      const at = t0 + Math.pow(Math.random(), 1.5) * dur;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.5 + Math.random() * 0.5, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03 + Math.random() * 0.03);
      src.connect(g).connect(bp);
      src.start(at, Math.random() * 0.8, 0.08);
    }
    if (level > 0.8) {
      for (let k = 0; k < 5; k++) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        const f = 260 + Math.random() * 160;
        osc.frequency.setValueAtTime(f, t0);
        osc.frequency.linearRampToValueAtTime(f * 1.5, t0 + 0.5);
        osc.frequency.linearRampToValueAtTime(f * 1.2, t0 + 1.2);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.012, t0 + 0.25);
        g.gain.linearRampToValueAtTime(0.0001, t0 + 1.3);
        osc.connect(lp).connect(g).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 1.4);
      }
    }
  }

  dispose() {
    this.stopRoll();
    void this.ctx?.close();
    this.ctx = null;
  }
}
