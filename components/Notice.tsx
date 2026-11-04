import Image from "next/image";
import type { ReactNode } from "react";
import { buttonRow } from "./Button";

const base = import.meta.env.BASE_URL;

/** The pictures, cream paper like the notice. The cap shows the shutter by day and the stall by night. */
const PICTURES = {
  empty: [{ src: "spot-empty-cup.jpg", look: "" }],
  cap: [
    { src: "spot-shutter-day.jpg", look: "night:hidden" },
    { src: "spot-stall-night.jpg", look: "day:hidden" },
  ],
};

type Props = {
  picture?: keyof typeof PICTURES;
  kicker?: string;
  headline: string;
  body?: ReactNode;
  /** The next-step buttons, sharing a row when they fit, then anything under them. */
  actions: ReactNode;
  children?: ReactNode;
};

/** A paper notice taped to the wall, in place of the summary and the Spin button (docs/redesign.md, Notices). */
export function Notice({ picture, kicker, headline, body, actions, children }: Props) {
  return (
    // .paper keeps the day ink, fields and focus ring on the cream in both looks (app/lapar-tokens.css).
    <div className="paper relative mt-1 flex flex-col gap-3 rounded-paper border-2 border-paper-edge bg-paper p-4 text-paper-ink shadow-paper">
      <span
        aria-hidden="true"
        className="absolute -top-[11px] left-1/2 h-[22px] w-[88px] -translate-x-1/2 -rotate-3 bg-tape shadow-tape"
      />
      <div className="flex items-center gap-3">
        {picture &&
          PICTURES[picture].map((p) => (
            <Image
              key={p.src}
              src={`${base}images/${p.src}`}
              alt=""
              width={104}
              height={104}
              className={`feathered size-26 shrink-0 ${p.look}`}
            />
          ))}
        <div className="flex min-w-0 flex-col gap-1">
          {/* Balanced and pretty wraps: no word left alone on a line on 360px phones. */}
          {kicker && <p className="text-notice-kicker text-balance text-paper-kicker">{kicker}</p>}
          <h2 className="font-sign text-notice-title">{headline}</h2>
        </div>
      </div>
      {typeof body === "string" ? (
        <p className="text-notice-body text-pretty">{body}</p>
      ) : (
        body && <div className="text-notice-body text-pretty">{body}</div>
      )}
      <div className={buttonRow}>{actions}</div>
      {children}
    </div>
  );
}
