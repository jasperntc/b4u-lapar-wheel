import { describe, expect, it, vi } from "vitest";
import { SPIN_MS, wheelRotation } from "../lib/near-me";
import { Spinner, WAIT_SPEED, isSwipe, landingTarget, segmentAtPointer, ticksBetween } from "../lib/spin";
import { read } from "./source-files";

const FRAME = 16;

/** A Spinner on a fake clock: frame() advances 16 ms and runs the pending animation frame. */
function rig(n = 8) {
  let now = 0;
  let pending: (() => void) | null = null;
  const s = new Spinner({
    now: () => now,
    raf: (cb) => ((pending = cb), 1),
    caf: () => (pending = null),
  });
  s.setSegments(n);
  const ticks = vi.fn();
  const stopped = vi.fn();
  s.listen({ onTick: ticks, onStop: stopped });
  const frame = () => {
    now += FRAME;
    const cb = pending;
    pending = null;
    cb?.();
    return s.angle;
  };
  /** Runs frames until the spinner stops (or a safety limit), returning every angle on the way. */
  const settle = () => {
    const angles = [s.angle];
    for (let i = 0; i < 2 * (SPIN_MS / FRAME) && s.moving; i++) angles.push(frame());
    return angles;
  };
  return { s, frame, settle, ticks, stopped };
}

const steps = (angles: number[]) => angles.slice(1).map((a, i) => a - angles[i]);

describe("ticksBetween", () => {
  it("counts the segment boundaries a known landing passes", () => {
    // Segment 3 of 8 lands at 5 turns plus 202.5°: 5 × 8 boundaries, plus 4 more (45, 90, 135, 180).
    expect(wheelRotation(0, 3, 8)).toBe(2002.5);
    expect(ticksBetween(0, 2002.5, 8)).toBe(44);
  });

  it("counts one boundary every 360/n degrees, in either direction", () => {
    expect(ticksBetween(10, 100, 4)).toBe(1);
    expect(ticksBetween(100, -100, 4)).toBe(3);
    expect(ticksBetween(0, 720, 1)).toBe(2);
    expect(ticksBetween(0, 360, 7)).toBe(7);
    expect(ticksBetween(0, 360, 20)).toBe(20);
    expect(ticksBetween(1, 17, 20)).toBe(0);
  });
});

describe("isSwipe", () => {
  it("starts a spin only above 0.25 degrees per ms, either way", () => {
    expect(isSwipe(0.25)).toBe(false);
    expect(isSwipe(-0.25)).toBe(false);
    expect(isSwipe(0.1)).toBe(false);
    expect(isSwipe(0.2501)).toBe(true);
    expect(isSwipe(-0.3)).toBe(true);
  });
});

describe("landingTarget", () => {
  it("is wheelRotation's target from rest or at the waiting speed", () => {
    expect(landingTarget(0, 3, 8, 0)).toBe(wheelRotation(0, 3, 8));
    expect(landingTarget(40, 3, 8, WAIT_SPEED)).toBe(wheelRotation(40, 3, 8));
    expect(landingTarget(40, 3, 8, -WAIT_SPEED)).toBe(wheelRotation(40, 3, 8, -1));
  });

  it("adds whole turns so a fast wheel never has to slow down to land", () => {
    for (const speed of [2, -2, 3.7]) {
      const t = landingTarget(0, 5, 12, speed);
      expect((3 * Math.abs(t)) / SPIN_MS).toBeGreaterThanOrEqual(Math.abs(speed));
      expect((3 * (Math.abs(t) - 360)) / SPIN_MS).toBeLessThan(Math.abs(speed));
      expect(Math.sign(t)).toBe(Math.sign(speed));
      expect(segmentAtPointer(t, 12)).toBe(5);
    }
  });
});

describe("Spinner", () => {
  it("hands the waiting spin over to a landing on the picked segment", () => {
    const { s, frame, settle } = rig();
    s.wait(0);
    for (let i = 0; i < 150; i++) frame();
    expect(s.speed).toBeCloseTo(WAIT_SPEED, 2);
    expect(s.angle).toBeGreaterThan(0);
    const done = vi.fn();
    const target = landingTarget(s.angle, 3, 8, s.speed);
    s.land(target, done);
    settle();
    expect(done).toHaveBeenCalledTimes(1);
    expect(s.angle).toBe(target);
    expect(segmentAtPointer(s.angle, 8)).toBe(3);
    expect(s.moving).toBe(false);
  });

  it("eases a fast swipe down toward the waiting speed, then lands on the pick", () => {
    const { s, frame, settle } = rig();
    s.wait(0.8);
    const angles = [s.angle];
    for (let i = 0; i < 40; i++) angles.push(frame());
    expect(steps(angles).every((d, i, all) => d > 0 && (i === 0 || d <= all[i - 1] + 1e-9))).toBe(true);
    const done = vi.fn();
    s.land(landingTarget(s.angle, 6, 8, s.speed), done);
    settle();
    expect(done).toHaveBeenCalledTimes(1);
    expect(segmentAtPointer(s.angle, 8)).toBe(6);
  });

  it("keeps a backwards swipe's direction all the way, and lands on the same pick", () => {
    const { s, frame, settle } = rig();
    s.wait(-0.8);
    const angles = [s.angle];
    for (let i = 0; i < 20; i++) angles.push(frame());
    const done = vi.fn();
    s.land(landingTarget(s.angle, 3, 8, s.speed), done);
    angles.push(...settle().slice(1));
    expect(steps(angles).every((d) => d <= 0)).toBe(true);
    expect(done).toHaveBeenCalledTimes(1);
    expect(segmentAtPointer(s.angle, 8)).toBe(3);
  });

  it("gives no second push: the landing starts no slower than the wheel was turning", () => {
    for (const v0 of [1, -1, 2.5]) {
      const { s, frame, settle } = rig();
      s.wait(v0);
      frame();
      frame();
      frame();
      const before = Math.abs(s.speed);
      const from = s.angle;
      const done = vi.fn();
      s.land(landingTarget(from, 2, 8, s.speed), done);
      const first = Math.abs(frame() - from) / FRAME;
      // Ease-out cubic's first frame is a hair under its starting speed: one frame's rounding.
      expect(first).toBeGreaterThanOrEqual(before * (1 - (2 * FRAME) / SPIN_MS));
      settle();
      expect(segmentAtPointer(s.angle, 8)).toBe(2);
    }
  });

  it("coasts to a stop without stepping back when there's nothing to land on", () => {
    const { s, frame, settle, stopped } = rig();
    s.wait(0);
    for (let i = 0; i < 60; i++) frame();
    s.coast();
    const angles = settle();
    expect(steps(angles).every((d) => d >= 0)).toBe(true);
    expect(s.moving).toBe(false);
    expect(stopped).toHaveBeenCalledTimes(1);
  });

  it("ticks at most once a frame while landing, and on every boundary a drag passes", () => {
    const { s, ticks, settle } = rig(20);
    s.land(wheelRotation(0, 7, 20), () => {});
    const frames = settle().length - 1;
    expect(ticks.mock.calls.length).toBeGreaterThan(0);
    expect(ticks.mock.calls.length).toBeLessThanOrEqual(frames);

    const d = rig(4);
    d.s.drag(50);
    expect(d.ticks).not.toHaveBeenCalled();
    d.s.drag(50);
    expect(d.ticks).toHaveBeenCalledTimes(1);
  });

  it("ignores a drag while it turns on its own, and snaps to a landing target", () => {
    const { s, frame, stopped } = rig();
    s.wait(0);
    frame();
    const at = s.angle;
    s.drag(90);
    expect(s.angle).toBe(at);
    s.snap(wheelRotation(at, 1, 8));
    expect(s.moving).toBe(false);
    expect(segmentAtPointer(s.angle, 8)).toBe(1);
    expect(stopped).toHaveBeenCalledTimes(1);
  });

  it("writes the angle to the wheel it's attached to", () => {
    const { s } = rig();
    const el = { style: { transform: "" } } as unknown as HTMLElement;
    s.attach(el);
    s.snap(42);
    expect(el.style.transform).toBe("rotate(42deg)");
  });
});

it("never uses Math.random for the spin", () => {
  for (const file of ["lib/spin.ts", "lib/sound.ts", "components/Wheel.tsx", "components/NearMe.tsx"]) {
    expect(read(file), file).not.toContain("Math.random");
  }
});
