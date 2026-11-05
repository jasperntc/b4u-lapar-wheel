// @vitest-environment happy-dom
// A spin end to end through NearMe: the button's phases, reduced motion, the landing chime, buzz and winner highlight.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { wheelRotation } from "../lib/near-me";

const PLACES = ["Kedai Satu", "Kedai Dua", "Kedai Tiga"].map((name, i) => ({
  id: `ChIJplace${i}aaaaaaaaaaa`,
  name,
  lat: 5.98,
  lon: 116.07,
  primaryType: "restaurant",
  distanceM: 300 + i * 100,
}));
const FIX = { coords: { latitude: 5.98, longitude: 116.07 } } as GeolocationPosition;

let root: Root;
let host: HTMLElement;
let reduce: boolean;
let notes: number[];
let vibrate: ReturnType<typeof vi.fn>;

// A stand-in for Web Audio that records each note's pitch: ticks are triangles, the chime is sines.
class FakeAudio {
  state = "running";
  currentTime = 0;
  destination = {};
  createOscillator() {
    const o = { type: "", frequency: { value: 0 }, connect: <T,>(g: T) => g, start: () => {}, stop() {} };
    o.start = () => void (o.type === "sine" && notes.push(o.frequency.value));
    return o;
  }
  createGain() {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: <T,>(d: T) => d };
  }
  resume() {
    return Promise.resolve();
  }
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubEnv("BASE_URL", "/lapar-wheel/");
  history.replaceState(null, "", "/lapar-wheel");
  localStorage.clear();
  reduce = true;
  notes = [];
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(PLACES)));
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce") && reduce, media: q }));
  vi.stubGlobal("AudioContext", FakeAudio);
  vibrate = vi.fn(() => true);
  Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
  locateWith((ok) => ok(FIX));
  // pickIndex draws 1, so the pick is index 1 of 3.
  vi.spyOn(crypto, "getRandomValues").mockImplementation(((a: Uint32Array) => {
    a[0] = 1;
    return a;
  }) as typeof crypto.getRandomValues);
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

function locateWith(impl: (ok: PositionCallback) => void) {
  Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: impl }, configurable: true });
}

async function mount() {
  const { NearMe } = await import("../components/NearMe");
  root = createRoot(host);
  await act(async () => root.render(<NearMe />));
}

const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === label);
const click = (label: string) => act(async () => button(label)?.click());
const wheel = () => host.querySelector<HTMLElement>('section[aria-label="Wheel"] > div');
const dimmed = () =>
  [...host.querySelectorAll<SVGGElement>('section[aria-label="Wheel"] g.wheel-face > g')].map((g) => g.style.opacity === "0.55");

it("goes straight to the pick under reduced motion: no frames, one 70 ms buzz, the chime, the winner highlighted", async () => {
  const raf = vi.spyOn(globalThis, "requestAnimationFrame");
  await mount();
  await click("Spin");

  expect(host.textContent).toContain("Go makan at");
  expect(host.querySelector("h2")?.textContent).toBe("Kedai Dua");
  expect(raf).not.toHaveBeenCalled();
  const turning = host.querySelector<HTMLElement>('section[aria-label="Wheel"] [style*="rotate"]');
  expect(turning?.style.transform).toBe(`rotate(${wheelRotation(0, 1, 3)}deg)`);
  expect(vibrate.mock.calls).toEqual([[70]]);
  // Sound isn't motion: one chime (two notes) even under reduced motion.
  expect(notes).toHaveLength(2);
  expect(dimmed()).toEqual([true, false, true]);
  expect(wheel()?.dataset.landed).toBe("true");

  await click("Spin again");
  expect(notes).toHaveLength(4);
  expect(vibrate).toHaveBeenCalledTimes(2);
});

it("lands without the chime when Sound is off, and still buzzes", async () => {
  localStorage.setItem("lapar-wheel:sound", "off");
  await mount();
  await click("Spin");
  expect(host.querySelector("h2")?.textContent).toBe("Kedai Dua");
  expect(notes).toEqual([]);
  expect(vibrate).toHaveBeenCalledTimes(1);
});

it("says what it's doing: finding you, finding open places, then spinning, and clears the last highlight", async () => {
  await mount();
  await click("Spin");
  expect(dimmed()).toEqual([true, false, true]);

  // Now animated, and the landing never finishes: frames never come.
  reduce = false;
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  await click("Spin again");
  expect(button("Spinning…")).toBeDefined();
  expect(dimmed()).toEqual([false, false, false]);
  expect(wheel()?.dataset.landed).toBeUndefined();
});

it("labels each phase of a first spin", async () => {
  reduce = false;
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  let found: () => void = () => {};
  locateWith((ok) => (found = () => ok(FIX)));
  let reply: () => void = () => {};
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (reply = () => r(Response.json(PLACES))))));
  await mount();

  await click("Spin");
  expect(button("Finding you…")).toBeDefined();
  await act(async () => found());
  expect(button("Finding open places…")).toBeDefined();
  await act(async () => reply());
  expect(button("Spinning…")).toBeDefined();
  expect(notes).toEqual([]);
});

it("owns the drag only while a swipe can start, and its turning corners never take a touch", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
  await mount();
  const turning = host.querySelector<HTMLElement>('section[aria-label="Wheel"] [style*="rotate"]');
  // Mid-turn the square's corners reach past the wheel over the card and summary below.
  expect(turning?.classList).toContain("pointer-events-none");
  expect(wheel()?.classList).toContain("touch-none");
  await click("Spin");
  // Nothing open: a notice, so the wheel scrolls the page like any other part of it.
  expect(host.textContent).toContain("Nothing open nearby");
  expect(wheel()?.classList).not.toContain("touch-none");
});
