/** Rooftop Rush sound (Web Audio, synthesised): city wind and traffic bed, a driving beat that
 *  speeds up with you, footsteps on gravel, take-off whoosh, landing thud, slide scrape, clang
 *  on hits, climb scuffs, speed-pad zap, "perfect" chime, start horn and finish cheer. */
export class ParkourAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bed: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private noise: AudioBuffer | null = null;
  private beatTimer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private beatN = 0;
  private tempo = 118;
  private musicOn = false;
  enabled = true;

  private ensure() {
    if (!this.enabled || typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private out() {
    return this.master!;
  }

  private buf(ctx: AudioContext) {
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let b = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b = 0.98 * b + 0.02 * w;
        d[i] = w * 0.45 + b * 3.5;
      }
    }
    return this.noise;
  }

  /** Call from a user gesture (tap/key) so mobile browsers allow sound. */
  unlock() {
    const ctx = this.ensure();
    if (!ctx || this.bed) return;
    const src = ctx.createBufferSource();
    src.buffer = this.buf(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.07;
    src.connect(filter).connect(gain).connect(this.out());
    src.start();
    this.bed = { gain, filter };
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
    if (on) this.unlock();
  }

  /** Wind rises with speed. */
  speed(v: number) {
    if (!this.ctx || !this.bed) return;
    const t = this.ctx.currentTime;
    this.bed.gain.gain.setTargetAtTime(0.05 + Math.min(1, v / 11) * 0.09, t, 0.2);
    this.bed.filter.frequency.setTargetAtTime(380 + v * 90, t, 0.2);
    this.tempo = 112 + Math.min(1, v / 10) * 22;
  }

  private burst(freq: number, q: number, vol: number, dur: number, type: BiquadFilterType = "bandpass", sweepTo?: number) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.buf(ctx);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out());
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private tone(freq: number, vol: number, dur: number, type: OscillatorType = "sine", glideTo?: number, at = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out());
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  step(near = 1) {
    this.burst(1800 + Math.random() * 900, 1.2, 0.05 * near, 0.06, "bandpass");
  }
  jump() {
    this.burst(500, 0.8, 0.16, 0.25, "bandpass", 1600);
  }
  land(hard = 0.5) {
    this.burst(140, 0.7, 0.3 * (0.5 + hard), 0.16, "lowpass");
    this.burst(2200, 1, 0.06, 0.08);
  }
  slide() {
    this.burst(2600, 0.6, 0.12, 0.5, "bandpass", 900);
  }
  hit() {
    this.tone(220, 0.22, 0.25, "square", 110);
    this.burst(900, 2, 0.2, 0.2);
  }
  climb() {
    this.burst(1200, 1, 0.08, 0.1);
    setTimeout(() => this.burst(1000, 1, 0.07, 0.1), 120);
  }
  fall() {
    this.tone(700, 0.12, 0.9, "sine", 120);
    this.burst(800, 0.5, 0.1, 0.9, "bandpass", 200);
  }
  pad() {
    this.tone(320, 0.14, 0.35, "sawtooth", 1280);
    this.tone(640, 0.06, 0.3, "triangle", 2000, 0.03);
  }
  perfect() {
    [880, 1109, 1319].forEach((f, k) => this.tone(f, 0.1, 0.22, "triangle", undefined, k * 0.06));
  }
  beep(final = false) {
    this.tone(final ? 1046 : 523, 0.2, final ? 0.5 : 0.18, "square");
  }
  cheer() {
    this.burst(900, 0.5, 0.18, 2.2, "bandpass", 1500);
    [523, 659, 784, 1046].forEach((f, k) => this.tone(f, 0.08, 0.35, "triangle", undefined, k * 0.09));
  }
  lose() {
    [392, 330, 262].forEach((f, k) => this.tone(f, 0.08, 0.35, "triangle", undefined, k * 0.14));
  }

  /** Driving beat (kick, hat, bass) scheduled ahead with the audio clock. */
  music(on: boolean) {
    const ctx = this.ensure();
    if (!ctx || on === this.musicOn) return;
    this.musicOn = on;
    if (!on) {
      if (this.beatTimer) clearInterval(this.beatTimer);
      this.beatTimer = null;
      return;
    }
    this.nextBeat = ctx.currentTime + 0.1;
    this.beatN = 0;
    const bass = [55, 55, 65.4, 49];
    this.beatTimer = setInterval(() => {
      if (!this.ctx || !this.enabled) return;
      while (this.nextBeat < this.ctx.currentTime + 0.25) {
        const at = this.nextBeat - this.ctx.currentTime;
        const n = this.beatN;
        const eighth = n % 2;
        if (!eighth) this.kick(at);
        this.hat(at, eighth ? 0.035 : 0.02);
        if (n % 8 === 4) this.snare(at);
        if (!eighth) this.tone(bass[Math.floor(n / 8) % 4]! * (n % 4 === 2 ? 2 : 1), 0.07, 0.22, "sawtooth", undefined, Math.max(0, at));
        this.beatN++;
        this.nextBeat += 60 / this.tempo / 2;
      }
    }, 60);
  }

  private kick(at: number) {
    this.tone(120, 0.32, 0.18, "sine", 42, Math.max(0, at));
  }
  private hat(at: number, vol: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + Math.max(0, at);
    const src = ctx.createBufferSource();
    src.buffer = this.buf(ctx);
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f).connect(g).connect(this.out());
    src.start(t, Math.random());
    src.stop(t + 0.08);
  }
  private snare(at: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + Math.max(0, at);
    const src = ctx.createBufferSource();
    src.buffer = this.buf(ctx);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    src.connect(f).connect(g).connect(this.out());
    src.start(t, Math.random());
    src.stop(t + 0.18);
  }

  destroy() {
    this.music(false);
    void this.ctx?.close();
    this.ctx = null;
  }
}
