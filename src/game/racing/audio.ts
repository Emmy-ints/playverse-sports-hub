/** Synthesised racing sounds (Web Audio): engine with gear changes, tyre squeal, impacts, start beeps. */
export class RaceAudio {
  private ctx: AudioContext | null = null;
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; lp: BiquadFilterNode } | null = null;
  private squeal: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
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

  unlock() {
    this.ensure();
  }

  private startLoops(ctx: AudioContext) {
    if (this.engine) return;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const osc2 = ctx.createOscillator();
    osc2.type = "square";
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    osc.connect(lp);
    osc2.connect(g2).connect(lp);
    lp.connect(gain).connect(ctx.destination);
    osc.start();
    osc2.start();
    this.engine = { osc, osc2, gain, lp };
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400;
    bp.Q.value = 3;
    const sg = ctx.createGain();
    sg.gain.value = 0;
    src.connect(bp).connect(sg).connect(ctx.destination);
    src.start();
    this.squeal = { src, gain: sg };
  }

  /** Call every frame for the player's car. */
  update(speed: number, throttle: number, drift: number) {
    const ctx = this.ensure();
    if (!ctx) return;
    this.startLoops(ctx);
    const e = this.engine!;
    // Six gears: rpm rises within each gear band, drops on upshift.
    const kmh = speed * 3.6;
    const bands = [0, 45, 80, 115, 150, 190, 400];
    let g = 0;
    while (g < bands.length - 2 && kmh > bands[g + 1]!) g++;
    const within = (kmh - bands[g]!) / (bands[g + 1]! - bands[g]!);
    const rpm = 1200 + within * 5800 + throttle * 600;
    const f = rpm / 60; // firing frequency-ish
    const t = ctx.currentTime;
    e.osc.frequency.setTargetAtTime(f, t, 0.05);
    e.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    e.lp.frequency.setTargetAtTime(500 + throttle * 1400 + within * 600, t, 0.08);
    e.gain.gain.setTargetAtTime(0.035 + throttle * 0.05, t, 0.1);
    this.squeal!.gain.gain.setTargetAtTime(drift > 0.35 && speed > 8 ? 0.05 * drift : 0, t, 0.06);
  }

  impact(strength: number) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.5, 0.08 + strength * 0.02), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  beep(high: boolean) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = high ? 1320 : 660;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (high ? 0.6 : 0.25));
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.65);
  }

  silence() {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    this.engine.gain.gain.setTargetAtTime(0, t, 0.1);
    this.squeal?.gain.gain.setTargetAtTime(0, t, 0.05);
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
    this.engine = null;
    this.squeal = null;
  }
}
