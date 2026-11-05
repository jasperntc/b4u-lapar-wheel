// @vitest-environment happy-dom
// The location request: a quick network fix, not a GPS wait, since the Worker rounds it to ~110 m anyway.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let root: Root;
let host: HTMLElement;
let locate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubEnv("BASE_URL", "/lapar-wheel/");
  history.replaceState(null, "", "/lapar-wheel");
  vi.stubGlobal("fetch", vi.fn());
  // Refused, so the test stops at the location step: no search, no spin.
  locate = vi.fn((_ok: PositionCallback, refused: PositionErrorCallback) => refused({ code: 1 } as GeolocationPositionError));
  Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: locate }, configurable: true });
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("asks for a quick fix, reusing one up to 10 minutes old, and gives up after 10 s", async () => {
  const { NearMe } = await import("../components/NearMe");
  root = createRoot(host);
  await act(async () => root.render(<NearMe />));
  const spin = [...host.querySelectorAll("button")].find((b) => b.textContent === "Spin");
  await act(async () => spin?.click());

  expect(locate).toHaveBeenCalledTimes(1);
  expect(locate.mock.calls[0][2]).toEqual({ enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
  expect(host.textContent).toContain("Location is off");
});
