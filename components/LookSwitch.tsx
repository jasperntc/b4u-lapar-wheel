"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { LOOK_KEY, lightTimings, lookFor, shouldPlayLights, type Look, type LookChoice } from "@/lib/look";

/** The footer's small toggle pills: the Look switch and the Sound toggle. */
export const pill =
  "min-h-8 cursor-pointer rounded-full border-(length:--edge) border-subtle-edge bg-ghost px-3 text-small text-ink aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent";

const CHOICES: [LookChoice, string][] = [
  ["auto", "Auto"],
  ["day", "Day"],
  ["night", "Night"],
];

// The stored choice, kept here too so the switch still works when storage throws.
let remembered: LookChoice | null = null;
const listeners = new Set<() => void>();

function readChoice(): LookChoice {
  if (remembered) return remembered;
  try {
    const stored = localStorage.getItem(LOOK_KEY);
    return stored === "day" || stored === "night" ? stored : "auto";
  } catch {
    return "auto";
  }
}

function choose(choice: LookChoice) {
  remembered = choice;
  try {
    localStorage.setItem(LOOK_KEY, choice);
  } catch {}
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let lightsTimer: ReturnType<typeof setTimeout> | undefined;

/** Shows `next` on <html>: a 400 ms cross-fade where supported, the lights coming on for day to night. */
function showLook(next: Look, themeColor: Record<Look, string>) {
  const root = document.documentElement;
  const prev = root.dataset.look === "day" || root.dataset.look === "night" ? root.dataset.look : null;
  if (prev === next) return;
  const env = { hidden: document.hidden, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches };
  const swap = () => {
    root.dataset.look = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor[next]);
    clearTimeout(lightsTimer);
    delete root.dataset.lights;
    if (!shouldPlayLights(prev, next, env)) return;
    root.dataset.lights = "";
    lightsTimer = setTimeout(() => delete root.dataset.lights, lightTimings().total);
  };
  if (env.hidden || env.reducedMotion || !("startViewTransition" in document)) swap();
  else document.startViewTransition(swap);
}

/** Auto, Day or Night. Auto follows the device clock, re-checked every minute. The inline script set the first look. */
export function LookSwitch({ themeColor }: { themeColor: Record<Look, string> }) {
  const choice = useSyncExternalStore(subscribe, readChoice, (): LookChoice => "auto");
  // Hydration renders "auto" before the stored choice, and the inline script already set the look: skip that pass.
  const mounted = useRef(false);

  useEffect(() => {
    const apply = () => showLook(lookFor(choice, new Date().getHours()), themeColor);
    if (mounted.current) apply();
    mounted.current = true;
    if (choice !== "auto") return;
    const timer = setInterval(apply, 60_000);
    return () => clearInterval(timer);
  }, [choice, themeColor]);

  return (
    <div role="group" aria-label="Look" className="flex gap-1">
      {CHOICES.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={choice === value}
          onClick={() => choose(value)}
          className={pill}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
