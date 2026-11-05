import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

// A fresh module each time: it remembers the choice in memory.
const load = () => import("../lib/sound");

describe("the sound setting", () => {
  it("is on by default", async () => {
    const { soundOn } = await load();
    expect(soundOn()).toBe(true);
  });

  it("is stored as lapar-wheel:sound and read back", async () => {
    const { SOUND_KEY, setSound, soundOn } = await load();
    expect(SOUND_KEY).toBe("lapar-wheel:sound");
    setSound(false);
    expect(store.get("lapar-wheel:sound")).toBe("off");
    vi.resetModules();
    expect((await load()).soundOn()).toBe(false);
    setSound(true);
    expect(store.get("lapar-wheel:sound")).toBe("on");
    expect(soundOn()).toBe(true);
  });

  it("still toggles when storage throws", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const { setSound, soundOn, subscribeSound } = await load();
    const heard = vi.fn();
    subscribeSound(heard);
    expect(soundOn()).toBe(true);
    setSound(false);
    expect(soundOn()).toBe(false);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

describe("chime", () => {
  // A stand-in for Web Audio that records each note's wave and pitch.
  function fakeAudio(look: "day" | "night") {
    const notes: [string, number][] = [];
    class Ctx {
      state = "running";
      currentTime = 0;
      destination = {};
      createOscillator() {
        const o = { type: "", frequency: { value: 0 }, connect: <T>(g: T) => g, start() {}, stop() {} };
        // Recorded when it starts, once type and pitch are set.
        o.start = () => void notes.push([o.type, o.frequency.value]);
        return o;
      }
      createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: <T>(d: T) => d };
      }
      resume() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal("window", { AudioContext: Ctx });
    vi.stubGlobal("document", { documentElement: { dataset: { look } } });
    return notes;
  }

  it("plays two short sine notes per landing: 1320 then 1760 Hz by day, 880 then 1320 Hz by night", async () => {
    const day = fakeAudio("day");
    const s = await load();
    s.unlockAudio();
    s.chime();
    expect(day).toEqual([
      ["sine", 1320],
      ["sine", 1760],
    ]);
    vi.resetModules();
    const night = fakeAudio("night");
    const n = await load();
    n.unlockAudio();
    n.chime();
    expect(night).toEqual([
      ["sine", 880],
      ["sine", 1320],
    ]);
  });

  it("stays quiet with Sound off, and before any tap has started audio", async () => {
    const notes = fakeAudio("day");
    const s = await load();
    s.chime();
    expect(notes).toEqual([]);
    s.unlockAudio();
    s.setSound(false);
    s.chime();
    expect(notes).toEqual([]);
  });
});

describe("buzz", () => {
  it("does nothing, without throwing, where there's no vibrate (iPhone Safari)", async () => {
    vi.stubGlobal("navigator", {});
    const { buzz } = await load();
    expect(() => buzz([30, 40, 60])).not.toThrow();
  });

  it("vibrates with the pattern where it can", async () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    const { buzz } = await load();
    buzz([30, 40, 60]);
    expect(vibrate).toHaveBeenCalledWith([30, 40, 60]);
  });
});
