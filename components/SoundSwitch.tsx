"use client";

import { useSyncExternalStore } from "react";
import { setSound, soundOn, subscribeSound, unlockAudio } from "@/lib/sound";
import { pill } from "./LookSwitch";

/** Ticks on or off. The accessible name stays "Sound"; pressed means on. */
export function SoundSwitch() {
  const on = useSyncExternalStore(subscribeSound, soundOn, () => true);
  return (
    <button
      type="button"
      aria-label="Sound"
      aria-pressed={on}
      onClick={() => {
        setSound(!on);
        // A tap is the moment audio may start.
        unlockAudio();
      }}
      className={pill}
    >
      {on ? "Sound on" : "Sound off"}
    </button>
  );
}
