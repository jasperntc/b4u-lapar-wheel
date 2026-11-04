import type { CSSProperties } from "react";
import { LookSwitch } from "@/components/LookSwitch";
import { NearMe } from "@/components/NearMe";
import { lightTimings } from "@/lib/look";
import { laparToken } from "@/lib/tokens";

const lights = lightTimings();
const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

export default function Home() {
  return (
    <>
      {/* The day title's hand-painted wobble. */}
      <svg aria-hidden="true" width="0" height="0" className="absolute">
        <filter id="paint">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="t" />
          <feDisplacementMap in="SourceGraphic" in2="t" scale="2.2" />
        </filter>
      </svg>
      <div aria-hidden="true" className="awning h-11" />
      <div aria-hidden="true" className="flex h-[15px] items-start justify-between px-3">
        {lights.roof.map((l, i) => (
          <span key={i} className="lamp" style={delay(l.delay)} />
        ))}
      </div>

      <main id="main" className="mx-auto flex w-full max-w-[390px] flex-col gap-3 px-4 pt-3 pb-12">
        {/* Fixed height in both looks, so switching never shifts the page. */}
        <header className="signboard flex h-24 flex-col items-center justify-center gap-1 px-4 text-center">
          <h1 className="title font-sign text-title" style={delay(lights.title.delay)}>
            Lapar Wheel
          </h1>
          <p className="text-sub text-title-ink night:hidden">Can’t decide? Spin, then go makan.</p>
          <p className="text-sub day:hidden">Dinner or supper? Spin for what’s still open.</p>
        </header>

        <NearMe />

        <footer className="mt-6 flex flex-col items-center gap-4">
          <LookSwitch themeColor={laparToken("ground")} />
          <a
            href="https://built4you.jasperntc.dev"
            className="inline-flex items-center gap-2 font-display text-small text-ink-soft underline underline-offset-4"
          >
            {/* The gift-tag mark, drawn here so it follows the app's look, not the OS setting like the favicon. */}
            <svg aria-hidden="true" viewBox="0 0 32 32" className="size-3.5 fill-tag stroke-tag">
              <path
                fillRule="evenodd"
                strokeWidth="2"
                strokeLinejoin="round"
                d="M6 8 L12 2 L20 2 L26 8 L26 30 L6 30 Z M13.8 8 a2.2 2.2 0 1 0 4.4 0 a2.2 2.2 0 1 0 -4.4 0 Z"
              />
            </svg>
            Built4You, episode 1
          </a>
        </footer>
      </main>
    </>
  );
}
