import type { CSSProperties } from "react";
import Image from "next/image";
import { LookSwitch } from "@/components/LookSwitch";
import { NearMe } from "@/components/NearMe";
import { lightTimings } from "@/lib/look";
import { laparToken } from "@/lib/tokens";

// "/lapar-wheel/": plain paths like these don't get the basePath on their own.
const base = import.meta.env.BASE_URL;
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
            <Image src={`${base}brand/b4u-favicon.svg`} alt="" width={16} height={16} />
            Built4You, episode 1
          </a>
        </footer>
      </main>
    </>
  );
}
