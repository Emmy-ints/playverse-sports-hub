/** Synthesised tennis sounds (Web Audio, no files): racket "pock", bounce, crowd applause, umpire calls. */
export class TennisAudio {
  private ctx: AudioContext | null = null;
  private noiseBuf: AudioBuffer | null = null;
  enabled = true;
  voice = true;

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

  /** Call from a user gesture so browsers allow sound. */
  unlock() {
    this.ensure();
  }

  private noise(ctx: AudioContext) {
    if (this.noiseBuf) return this.noiseBuf;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    return buf;
  }

  private blip(freq: number, endFreq: number, dur: number, vol: number, type: OscillatorType = "sine", pan = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    osc.connect(g).connect(p).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Racket strike; `near` = 1 for the player closest to the camera. */
  hit(power: number, near: number) {
    const vol = (0.18 + 0.3 * power) * (0.45 + 0.55 * near);
    this.blip(1250, 420, 0.07, vol, "triangle");
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2600;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * 0.8, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t, Math.random() * 2, 0.06);
  }

  bounce(near: number) {
    this.blip(260, 120, 0.06, 0.08 + 0.12 * near, "sine");
  }

  /** Applause: many short filtered claps; `level` 0..1. */
  applause(level: number) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const claps = Math.round(40 + 160 * level);
    const dur = 1.2 + 2 * level;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.6;
    const master = ctx.createGain();
    master.gain.value = 0.05 + 0.08 * level;
    bp.connect(master).connect(ctx.destination);
    for (let i = 0; i < claps; i++) {
      const at = t0 + Math.pow(Math.random(), 1.6) * dur;
      const src = ctx.createBufferSource();
      src.buffer = this.noise(ctx);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.6 + Math.random() * 0.4, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03 + Math.random() * 0.03);
      src.connect(g).connect(bp);
      src.start(at, Math.random() * 2.5, 0.08);
    }
  }

  /** Crowd "ooh" when a ball lands just out or clips the net. */
  ooh() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const f = 180 + Math.random() * 120;
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.linearRampToValueAtTime(f * 0.8, t + 0.9);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.012, t + 0.2);
      g.gain.linearRampToValueAtTime(0.0001, t + 1);
      osc.connect(lp).connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.05);
    }
  }

  /** Umpire / line judge call using the browser's speech voice, if available. */
  call(text: string) {
    if (!this.enabled || !this.voice || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      u.pitch = 0.9;
      u.volume = 0.8;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* speech not available */
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
  }
}
