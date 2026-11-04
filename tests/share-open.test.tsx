// @vitest-environment happy-dom
// Opening a share link, end to end through NearMe: one status call, never a location or a spin.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ID = "ChIJN1t_tDeuEmsRUsoyG83frY4";

let root: Root;
let host: HTMLElement;
let fetchMock: ReturnType<typeof vi.fn>;
let locate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // Next sets BASE_URL to the basePath; Vite's default in tests is "/".
  vi.stubEnv("BASE_URL", "/lapar-wheel/");
  fetchMock = vi.fn(async () => Response.json({ id: ID, name: "Kedai Kopi", available: true }));
  vi.stubGlobal("fetch", fetchMock);
  locate = vi.fn();
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

async function open(search: string) {
  history.replaceState(null, "", `/lapar-wheel${search}`);
  const { NearMe } = await import("../components/NearMe");
  root = createRoot(host);
  await act(async () => root.render(<NearMe />));
}

const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));
const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === label);

describe("opening a share link", () => {
  it("makes exactly one status call, never searches, never asks for location", async () => {
    await open(`?p=${ID}`);
    expect(urls()).toEqual([`/lapar-wheel/api/place/${ID}?check=status`]);
    expect(urls().some((u) => u.includes("/api/nearby"))).toBe(false);
    expect(locate).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Kedai Kopi");
    expect(host.textContent).toContain("Shared with you");
  });

  it("drops a malformed p without any call, and shows the start screen", async () => {
    await open("?p=abc");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(location.search).not.toContain("p=");
    expect(locate).not.toHaveBeenCalled();
    expect(button("Spin")).toBeDefined();
  });

  it("Spin your own clears p and shows the start screen without spinning", async () => {
    await open(`?p=${ID}`);
    await act(async () => button("Spin your own")?.click());
    expect(location.search).toBe("");
    expect(button("Spin")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(locate).not.toHaveBeenCalled();
  });

  it("Try again repeats the same single call", async () => {
    fetchMock.mockImplementation(async () => Response.json({ error: "rate_limited" }, { status: 429 }));
    await open(`?p=${ID}`);
    expect(host.textContent).toContain("Slow down");
    await act(async () => button("Try again")?.click());
    expect(urls()).toEqual([`/lapar-wheel/api/place/${ID}?check=status`, `/lapar-wheel/api/place/${ID}?check=status`]);
    expect(locate).not.toHaveBeenCalled();
  });
});
