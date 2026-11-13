/** Athletics drivers: practice runs events locally against AI athletes; online mirrors the server. */
import { aiEvent, applyEventInput, createEvent, stepEvent, takeEventEvents, type EventEvent, type EventId, type EventState, type Key } from "./sim.ts";

export interface AthleticsDriver {
  readonly viewer: number;
  state(): EventState | null;
  press(key: Key, down: boolean): void;
  update(dt: number): EventEvent[];
  status(): string | null;
  destroy(): void;
}

export class PracticeAthleticsDriver implements AthleticsDriver {
  readonly viewer = 0;
  private s: EventState;
  private seq = 0;
  constructor(event: EventId, private skills: number[], seed = Math.floor(Math.random() * 1e9)) {
    this.s = createEvent(event, skills.length + 1, seed);
  }
  state() {
    return this.s;
  }
  press(key: Key, down: boolean) {
    applyEventInput(this.s, 0, { seq: ++this.seq, key, down });
  }
  update(dt: number) {
    for (let i = 1; i < this.s.athletes.length; i++) {
      const e = aiEvent(this.s, i, this.skills[i - 1]!, ++this.seq);
      if (e) applyEventInput(this.s, i, e);
    }
    stepEvent(this.s, Math.min(dt, 1 / 20));
    return takeEventEvents(this.s);
  }
  status() {
    return null;
  }
  destroy() {}
}
