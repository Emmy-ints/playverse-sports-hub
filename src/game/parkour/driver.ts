/** Rooftop Rush drivers: practice runs the race locally against computer runners; online mirrors the server. */
import { aiInput, applyInput, createRace, stepRace, takeEvents, type CourseLength, type Key, type ParkourEvent, type RaceState } from "./sim.ts";

export interface ParkourDriver {
  readonly viewer: number;
  state(): RaceState | null;
  press(key: Key, down: boolean): void;
  update(dt: number): ParkourEvent[];
  status(): string | null;
  destroy(): void;
}

export class PracticeParkourDriver implements ParkourDriver {
  readonly viewer = 0;
  private s: RaceState;
  private seq = 0;
  private skills: number[];
  constructor(skills: number[], length: CourseLength, seed = Math.floor(Math.random() * 1e9)) {
    this.skills = skills;
    this.s = createRace(skills.length + 1, seed, length);
  }
  state() {
    return this.s;
  }
  press(key: Key, down: boolean) {
    applyInput(this.s, 0, { seq: ++this.seq, key, down });
  }
  update(dt: number) {
    for (let i = 1; i < this.s.runners.length; i++) {
      const e = aiInput(this.s, i, this.skills[i - 1]!, ++this.seq);
      if (e) applyInput(this.s, i, e);
    }
    stepRace(this.s, Math.min(dt, 1 / 20));
    return takeEvents(this.s);
  }
  status() {
    return null;
  }
  destroy() {}
}
