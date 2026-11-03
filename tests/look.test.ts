import { describe, expect, it } from "vitest";
import {
  LOOK_KEY,
  lightSteps,
  lightTimings,
  lookFor,
  lookScript,
  ROOF_LAMPS,
  shouldPlayLights,
  WHEEL_BULBS,
  type LookChoice,
} from "../lib/look";

describe("lookFor", () => {
  it.each([
    [18, "day"],
    [19, "night"],
    [23, "night"],
    [0, "night"],
    [5, "night"],
    [6, "day"],
    [12, "day"],
  ] as const)("Auto at %i:00 is %s", (hour, look) => {
    expect(lookFor("auto", hour)).toBe(look);
  });

  it("Day and Night ignore the clock", () => {
    expect(lookFor("day", 22)).toBe("day");
    expect(lookFor("night", 12)).toBe("night");
  });
});

describe("lookScript", () => {
  /** Runs the inline script against a stub document, with what storage holds (or a throwing storage). */
  function run(stored: string | null | Error, hour: number) {
    const attrs: Record<string, string> = {};
    const meta: Record<string, string> = {};
    const document = {
      documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
      querySelector: () => ({ setAttribute: (k: string, v: string) => (meta[k] = v) }),
    };
    const localStorage = {
      getItem: (key: string) => {
        if (stored instanceof Error) throw stored;
        return key === LOOK_KEY ? stored : null;
      },
    };
    const RealDate = Date;
    const FakeDate = class extends RealDate {
      getHours() {
        return hour;
      }
    };
    new Function("document", "localStorage", "Date", lookScript({ day: "#day", night: "#night" }))(
      document,
      localStorage,
      FakeDate,
    );
    return { look: attrs["data-look"], themeColor: meta.content };
  }

  it("agrees with lookFor for every choice at the edges", () => {
    for (const choice of ["auto", "day", "night"] as LookChoice[]) {
      for (const hour of [5, 6, 18, 19]) {
        const look = lookFor(choice, hour);
        expect(run(choice === "auto" ? null : choice, hour), `${choice} at ${hour}`).toEqual({ look, themeColor: `#${look}` });
      }
    }
  });

  it("treats an unknown value or throwing storage as Auto", () => {
    expect(run("purple", 20).look).toBe("night");
    expect(run(new Error("blocked"), 20).look).toBe("night");
    expect(run(new Error("blocked"), 9).look).toBe("day");
  });
});

describe("shouldPlayLights", () => {
  const shown = { hidden: false, reducedMotion: false };

  it("plays only when the look changes from day to night while the page is open", () => {
    expect(shouldPlayLights("day", "night", shown)).toBe(true);
  });

  it("doesn't play on first render, when there's no earlier look", () => {
    expect(shouldPlayLights(null, "night", shown)).toBe(false);
  });

  it("doesn't play for night to day, which only cross-fades", () => {
    expect(shouldPlayLights("night", "day", shown)).toBe(false);
  });

  it("is skipped under reduced motion and on a hidden page", () => {
    expect(shouldPlayLights("day", "night", { hidden: false, reducedMotion: true })).toBe(false);
    expect(shouldPlayLights("day", "night", { hidden: true, reducedMotion: false })).toBe(false);
  });
});

describe("lightTimings", () => {
  const t = lightTimings();
  const all = [t.title, ...t.roof, ...t.wheel];

  it("has the title, 13 roof lamps and 24 wheel bulbs", () => {
    expect(t.roof).toHaveLength(ROOF_LAMPS);
    expect(t.wheel).toHaveLength(WHEEL_BULBS);
  });

  it("lights the title, then the roof left to right, then the wheel clockwise", () => {
    const starts = all.map((l) => l.delay);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(t.roof[0].delay).toBeGreaterThanOrEqual(t.title.delay + t.title.flash + t.title.gap);
    expect(t.roof.slice(1).map((l, i) => l.delay - t.roof[i].delay)).toEqual(Array(ROOF_LAMPS - 1).fill(40));
    expect(t.wheel.slice(1).map((l, i) => l.delay - t.wheel[i].delay)).toEqual(Array(WHEEL_BULBS - 1).fill(25));
  });

  it("lasts about 1.3 s, ending when the last light is on", () => {
    expect(t.total).toBeGreaterThanOrEqual(1200);
    expect(t.total).toBeLessThanOrEqual(1400);
    expect(Math.max(...all.map((l) => lightSteps(l).at(-1)![0]))).toBe(t.total);
  });

  it("flashes no light more than twice, so nothing passes three flashes a second", () => {
    for (const light of all) {
      const steps = lightSteps(light);
      expect(steps.filter(([, lit]) => lit).length).toBeLessThanOrEqual(2);
      expect(steps.at(-1)![1]).toBe(true);
      expect(steps.map(([ms]) => ms)).toEqual(steps.map(([ms]) => ms).sort((a, b) => a - b));
    }
  });
});
