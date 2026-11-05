// The wheel's motion (docs/redesign.md, Motion): frame by frame, with ticks. The pick is always made first;
// this only turns the wheel to the angle it's given.
import { SPIN_MS, wheelRotation } from "./near-me";

/** A release faster than this (degrees per ms, either way) starts a spin. */
export const SWIPE_MIN = 0.25;
/** The waiting spin's speed while the location or places are on their way. */
export const WAIT_SPEED = 0.12;
/** How long a waiting wheel takes to coast to a stop when there's nothing to land on. */
export const STOP_MS = 600;
// How quickly the waiting spin's speed settles to WAIT_SPEED (time constant).
const WAIT_EASE_MS = 400;
// Longest frame step: a tab coming back from hidden doesn't jump the waiting wheel.
const MAX_STEP_MS = 100;

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export const isSwipe = (v: number) => Math.abs(v) > SWIPE_MIN;

/** How many segment boundaries (every 360/n degrees) pass the pointer between two angles, either way. */
export function ticksBetween(from: number, to: number, n: number): number {
  const seg = 360 / n;
  return Math.abs(Math.floor(to / seg) - Math.floor(from / seg));
}

/** The segment under the top pointer at this rotation. */
export function segmentAtPointer(angle: number, n: number): number {
  return Math.floor(((((-angle) % 360) + 360) % 360) / (360 / n)) % n;
}

/**
 * Where a landing on `index` ends, turning the way the wheel already turns. Whole turns are added until an
 * ease-out cubic landing starts at least as fast as the wheel is going (3 × distance / SPIN_MS), so a fast
 * swipe never slows down and then gets a second push. From rest it's wheelRotation's target.
 */
export function landingTarget(current: number, index: number, n: number, speed: number): number {
  const dir = speed < 0 ? -1 : 1;
  let target = wheelRotation(current, index, n, dir);
  while ((3 * Math.abs(target - current)) / SPIN_MS < Math.abs(speed)) target += dir * 360;
  return target;
}

type Frames = { now: () => number; raf: (cb: () => void) => number; caf: (id: number) => void };
type Hooks = { onTick?: (segment: number) => void; onStop?: () => void };

const browser: Frames = {
  now: () => performance.now(),
  raf: (cb) => requestAnimationFrame(cb),
  caf: (id) => cancelAnimationFrame(id),
};

/** Turns the wheel by writing its transform each frame, so React never re-renders per frame. */
export class Spinner {
  angle = 0;
  /** Degrees per ms, signed: negative turns backwards. */
  speed = 0;
  private n = 10;
  private el: HTMLElement | null = null;
  private hooks: Hooks = {};
  private mode: "idle" | "wait" | "glide" = "idle";
  private frame = 0;
  private last = 0;
  private glide = { from: 0, to: 0, t0: 0, ms: 0, done: undefined as (() => void) | undefined };

  constructor(private frames: Frames = browser) {}

  /** True while it turns on its own (waiting, landing or coasting). A drag doesn't count. */
  get moving() {
    return this.mode !== "idle";
  }

  attach(el: HTMLElement | null) {
    this.el = el;
    this.render();
  }

  listen(hooks: Hooks) {
    this.hooks = hooks;
  }

  setSegments(n: number) {
    this.n = Math.max(1, n);
  }

  /** The finger's turn. Ignored while it turns on its own. */
  drag(delta: number) {
    if (!this.moving) this.moveTo(this.angle + delta);
  }

  /** The waiting spin: from `v0` (keeping its sign) toward WAIT_SPEED that way. */
  wait(v0: number) {
    this.speed = v0;
    this.mode = "wait";
    this.start();
  }

  /** Eases out (cubic) from here to `target` over SPIN_MS, then calls `done`. */
  land(target: number, done: () => void) {
    this.glideTo(target, SPIN_MS, done);
  }

  /** Eases a waiting wheel to a stop; the distance makes it start at its current speed. */
  coast() {
    if (this.mode !== "wait") return;
    if (!this.speed) return this.halt();
    this.glideTo(this.angle + (this.speed * STOP_MS) / 3, STOP_MS);
  }

  /** Stops at once, at `target` if given: the fallback timer and a skipped animation. */
  snap(target?: number) {
    if (target !== undefined) this.angle = target;
    this.render();
    this.halt();
  }

  private glideTo(to: number, ms: number, done?: () => void) {
    this.glide = { from: this.angle, to, t0: this.frames.now(), ms, done };
    this.mode = "glide";
    this.start();
  }

  private start() {
    this.last = this.frames.now();
    if (!this.frame) this.frame = this.frames.raf(this.step);
  }

  private halt() {
    if (this.frame) this.frames.caf(this.frame);
    this.frame = 0;
    const wasMoving = this.moving;
    this.mode = "idle";
    this.speed = 0;
    if (wasMoving) this.hooks.onStop?.();
  }

  private step = () => {
    this.frame = 0;
    const now = this.frames.now();
    const dt = Math.min(MAX_STEP_MS, Math.max(0, now - this.last));
    this.last = now;
    if (this.mode === "wait") {
      const goal = (this.speed < 0 ? -1 : 1) * WAIT_SPEED;
      this.speed += (goal - this.speed) * (1 - Math.exp(-dt / WAIT_EASE_MS));
      this.moveTo(this.angle + this.speed * dt);
    } else if (this.mode === "glide") {
      const g = this.glide;
      const t = Math.min(1, (now - g.t0) / g.ms);
      const before = this.angle;
      this.moveTo(t < 1 ? g.from + (g.to - g.from) * easeOutCubic(t) : g.to);
      if (dt) this.speed = (this.angle - before) / dt;
      if (t >= 1) {
        this.halt();
        g.done?.();
        return;
      }
    }
    if (this.moving) this.frame = this.frames.raf(this.step);
  };

  private moveTo(angle: number) {
    // One click per frame at most: a fast landing over 20 segments would otherwise ask for ~80 a second.
    if (ticksBetween(this.angle, angle, this.n)) this.hooks.onTick?.(segmentAtPointer(angle, this.n));
    this.angle = angle;
    this.render();
  }

  private render() {
    if (this.el) this.el.style.transform = `rotate(${this.angle}deg)`;
  }
}
