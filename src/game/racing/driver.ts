/** Race drivers feed the racing stage: practice runs the sim locally; online mirrors the server. */
import { aiDrive, applyCarInput, createRace, resetCar, stepRace, takeRaceEvents, type CarInput, type RaceEvent, type RaceState } from "./sim.ts";
import type { TrackDef } from "./track.ts";

export type LocalCarInput = Omit<CarInput, "seq">;

export interface RaceDriver {
  readonly viewer: number;
  state(): RaceState;
  input(i: LocalCarInput): void;
  reset(): void;
  update(dt: number): RaceEvent[];
  status(): string | null;
  destroy(): void;
}

export class PracticeRaceDriver implements RaceDriver {
  readonly viewer = 0;
  private s: RaceState;
  private seq = 0;
  private pending: LocalCarInput = { steer: 0, throttle: 0, brake: 0, handbrake: false };
  private skills: number[];

  constructor(track: TrackDef["id"], opponents: number, laps: number, level: number, wet = 0) {
    this.s = createRace(track, opponents + 1, laps);
    if (wet > 0) this.s.wet = wet;
    // Opponents spread around the chosen level so there's a race through the field.
    this.skills = Array.from({ length: opponents }, (_, i) => Math.max(0.3, Math.min(1, level + 0.12 - (i / Math.max(1, opponents - 1)) * 0.3)));
  }

  state() {
    return this.s;
  }

  input(i: LocalCarInput) {
    this.pending = i;
  }

  reset() {
    resetCar(this.s, 0);
  }

  update(dt: number) {
    const seq = ++this.seq;
    applyCarInput(this.s, 0, { ...this.pending, seq });
    for (let i = 1; i < this.s.cars.length; i++) applyCarInput(this.s, i, aiDrive(this.s, i, this.skills[i - 1]!, seq));
    stepRace(this.s, Math.min(dt, 1 / 20));
    // AI cars that get stuck reset themselves.
    for (let i = 1; i < this.s.cars.length; i++) if (this.s.cars[i]!.stuck > 3) resetCar(this.s, i);
    return takeRaceEvents(this.s);
  }

  status() {
    return null;
  }

  destroy() {}
}
