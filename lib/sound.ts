// Ticks and the landing buzz (docs/redesign.md, Motion). Sound is on by default; the choice is stored.

export const SOUND_KEY = "lapar-wheel:sound";

// The stored choice, kept here too so the toggle still works when storage throws.
let remembered: boolean | null = null;
const listeners = new Set<() => void>();
let audio: AudioContext | null = null;

export function soundOn(): boolean {
  if (remembered !== null) return remembered;
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSound(on: boolean) {
  remembered = on;
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {}
  for (const l of listeners) l();
}

export function subscribeSound(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Starts (or resumes) audio. Browsers only allow it inside a tap or a release, so call it from one. */
export function unlockAudio() {
  if (!soundOn()) return;
  try {
    const Ctx = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!audio && Ctx) audio = new Ctx();
    if (audio?.state === "suspended") audio.resume().catch(() => {});
  } catch {}
}

/** One click as a segment passes the pointer: a triangle wave, 1700 Hz by day and 2300 Hz by night, gone in 35 ms. */
export function tick() {
  if (!audio || audio.state !== "running" || !soundOn()) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "triangle";
  osc.frequency.value = document.documentElement.dataset.look === "night" ? 2300 : 1700;
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.04);
}

/** The landing chime: two short sine notes, 70 ms each and 40 ms apart. Day 1320 then 1760 Hz, night 880 then 1320 Hz. */
export function chime() {
  const ctx = audio;
  if (!ctx || ctx.state !== "running" || !soundOn()) return;
  const notes = document.documentElement.dataset.look === "night" ? [880, 1320] : [1320, 1760];
  notes.forEach((hz, i) => {
    const t = ctx.currentTime + i * 0.11;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.075);
  });
}

/** Vibrates where the browser can. iPhone Safari has no vibrate: that's skipped, not a failure. */
export function buzz(pattern: number | number[]) {
  try {
    if (typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch {}
}
