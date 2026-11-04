// Pure helpers for the Day/Night/Auto look (docs/redesign.md, "Looks" and "Lights coming on").

export type Look = "day" | "night";
export type LookChoice = "auto" | Look;

export const LOOK_KEY = "lapar-wheel:look";

/** Auto is night from 19:00 to 05:59 on the device clock. */
export function lookFor(choice: LookChoice, hour: number): Look {
  if (choice !== "auto") return choice;
  return hour >= 19 || hour < 6 ? "night" : "day";
}

/**
 * The inline script in <head> that sets data-look and theme-color before first paint, so a night
 * visit never flashes the day look. Same rule as lookFor; a test runs it against lookFor.
 * It makes the page's only theme-color meta itself: one rendered by React was re-inserted on hydration
 * whenever the script had changed its colour, leaving a second, day-coloured meta at night.
 */
export function lookScript(themeColor: Record<Look, string>): string {
  return `(function(){var c;try{c=localStorage.getItem(${JSON.stringify(LOOK_KEY)})}catch(e){}var h=new Date().getHours();var n=c==="night"||(c!=="day"&&(h>=19||h<6));document.documentElement.setAttribute("data-look",n?"night":"day");var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.setAttribute("name","theme-color");document.head.appendChild(m)}m.setAttribute("content",n?${JSON.stringify(themeColor.night)}:${JSON.stringify(themeColor.day)})})()`;
}

/** Lights come on only for a day-to-night change while the page is open: never on load, hidden or reduced motion. */
export function shouldPlayLights(
  prev: Look | null,
  next: Look,
  env: { hidden: boolean; reducedMotion: boolean },
): boolean {
  return prev === "day" && next === "night" && !env.hidden && !env.reducedMotion;
}

/** One light switching on: dark until `delay`, lit for `flash` ms, dark for `gap` ms, then on for good. */
export type Light = { delay: number; flash: number; gap: number };

export const ROOF_LAMPS = 13;
export const WHEEL_BULBS = 24;

// The flash and gap lengths are also the keyframe split in app/globals.css (title 60/140, bulbs 50/100).
const TITLE_FLASH = 60;
const TITLE_GAP = 80;
const BULB_FLASH = 50;
const BULB_GAP = 50;

/**
 * The lights-coming-on sequence: the neon title flickers on, then the roof lamps left to right 40 ms
 * apart, then the wheel bulbs clockwise from the pointer 25 ms apart, starting with the last roof lamp.
 * About 1.3 s in all. CSS animations play it from these delays.
 */
export function lightTimings(): { title: Light; roof: Light[]; wheel: Light[]; total: number } {
  const title = { delay: 0, flash: TITLE_FLASH, gap: TITLE_GAP };
  const roofStart = TITLE_FLASH + TITLE_GAP;
  const roof = Array.from({ length: ROOF_LAMPS }, (_, i) => ({ delay: roofStart + 40 * i, flash: BULB_FLASH, gap: BULB_GAP }));
  const wheelStart = roof[ROOF_LAMPS - 1].delay;
  const wheel = Array.from({ length: WHEEL_BULBS }, (_, k) => ({ delay: wheelStart + 25 * k, flash: BULB_FLASH, gap: BULB_GAP }));
  const last = wheel[WHEEL_BULBS - 1];
  return { title, roof, wheel, total: last.delay + last.flash + last.gap };
}

/** When a light changes, as [ms, lit] pairs, starting dark. */
export function lightSteps({ delay, flash, gap }: Light): [number, boolean][] {
  return [
    [delay, true],
    [delay + flash, false],
    [delay + flash + gap, true],
  ];
}
