/** Stadium sound (Web Audio, synthesised): crowd ambience that swells, starter's gun, spikes on the
 *  track, hurdle clatter, sand landing, javelin whoosh, cheers — plus the announcer's voice. */
export class StadiumAudio {
  private ctx: AudioContext | null = null;
  private crowd: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private noise: AudioBuffer | null = null;
  enabled = true;

  private ensure() {
    if (!this.enabled || typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private buf(ctx: AudioContext) {
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let b = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b = 0.97 * b + 0.03 * w;
        d[i] = w * 0.5 + b * 4;
      }
    }
    return this.noise;
  }

  unlock() {
    const ctx = this.ensure();
    if (ctx) this.startCrowd(ctx);
  }

  private startCrowd(ctx: AudioContext) {
    if (this.crowd) return;
    const src = ctx.createBufferSource();
    src.buffer = this.buf(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 700;
    filter.Q.value = 0.4;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    this.crowd = { gain, filter };
  }

  /** Crowd level 0..1 (0.15 murmur, 0.5 excited, 1 roar). */
  crowdLevel(level: number, seconds = 0.6) {
    const ctx = this.ensure();
    if (!ctx) return;
    this.startCrowd(ctx);
    const t = ctx.currentTime;
    this.crowd!.gain.gain.setTargetAtTime(0.03 + level * 0.16, t, seconds / 3);
    this.crowd!.filter.frequency.setTargetAtTime(600 + level * 900, t, seconds / 3);
  }

  roar(seconds = 2.5) {
    this.crowdLevel(1, 0.3);
    setTimeout(() => this.crowdLevel(0.25, 1.5), seconds * 1000);
  }

  hush() {
    this.crowdLevel(0.06, 0.8);
  }

  private burst(freq: number, q: number, vol: number, dur: number, type: BiquadFilterType = "bandpass") {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.buf(ctx);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t, Math.random(), dur + 0.05);
  }

  gun() {
    this.burst(1800, 0.5, 0.9, 0.35, "highpass");
    this.burst(160, 0.7, 0.8, 0.5, "lowpass");
  }

  step(near = 1) {
    this.burst(2400 + Math.random() * 900, 2, 0.12 * near, 0.04);
  }

  wrong() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = 140;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.14);
  }

  hurdle() {
    this.burst(900, 3, 0.4, 0.18);
    this.burst(300, 2, 0.35, 0.25);
  }

  sand() {
    this.burst(400, 0.8, 0.5, 0.45, "lowpass");
  }

  whoosh() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.buf(ctx);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 4;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t, 0, 0.85);
  }

  thud() {
    this.burst(220, 1, 0.4, 0.2, "lowpass");
  }

  say(text: string) {
    if (!this.enabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.92;
      u.pitch = 0.85;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* no voice */
    }
  }

  dispose() {
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    void this.ctx?.close();
    this.ctx = null;
    this.crowd = null;
  }
}
