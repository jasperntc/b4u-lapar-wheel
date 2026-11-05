// @vitest-environment happy-dom
// Reduced motion, end to end through NearMe: the same pick, straight away, with no frames and one short buzz.
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

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubEnv("BASE_URL", "/lapar-wheel/");
  history.replaceState(null, "", "/lapar-wheel");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(PLACES)));
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q }));
  Object.defineProperty(navigator, "geolocation", {
    value: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 5.98, longitude: 116.07 } } as GeolocationPosition) },
    configurable: true,
  });
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

it("goes straight to the pick under reduced motion: no frames, one 40 ms buzz", async () => {
  // pickIndex draws 1, so the pick is index 1 of 3.
  vi.spyOn(crypto, "getRandomValues").mockImplementation(((a: Uint32Array) => {
    a[0] = 1;
    return a;
  }) as typeof crypto.getRandomValues);
  const raf = vi.spyOn(globalThis, "requestAnimationFrame");
  const vibrate = vi.fn(() => true);
  Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });

  const { NearMe } = await import("../components/NearMe");
  root = createRoot(host);
  await act(async () => root.render(<NearMe />));
  const spin = [...host.querySelectorAll("button")].find((b) => b.textContent === "Spin");
  await act(async () => spin?.click());

  expect(host.textContent).toContain("Go makan at");
  expect(host.querySelector("h2")?.textContent).toBe("Kedai Dua");
  expect(raf).not.toHaveBeenCalled();
  const turning = host.querySelector<HTMLElement>('section[aria-label="Wheel"] [style*="rotate"]');
  expect(turning?.style.transform).toBe(`rotate(${wheelRotation(0, 1, 3)}deg)`);
  expect(vibrate).toHaveBeenCalledTimes(1);
  expect(vibrate).toHaveBeenCalledWith(40);
});

it("owns the drag only while a swipe can start, and its turning corners never take a touch", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
  const { NearMe } = await import("../components/NearMe");
  root = createRoot(host);
  await act(async () => root.render(<NearMe />));
  const wheel = () => host.querySelector<HTMLElement>('section[aria-label="Wheel"] > div');
  const turning = host.querySelector<HTMLElement>('section[aria-label="Wheel"] [style*="rotate"]');
  // Mid-turn the square's corners reach past the wheel over the card and summary below.
  expect(turning?.classList).toContain("pointer-events-none");
  expect(wheel()?.classList).toContain("touch-none");
  const spin = [...host.querySelectorAll("button")].find((b) => b.textContent === "Spin");
  await act(async () => spin?.click());
  // Nothing open: a notice, so the wheel scrolls the page like any other part of it.
  expect(host.textContent).toContain("Nothing open nearby");
  expect(wheel()?.classList).not.toContain("touch-none");
});
