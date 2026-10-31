import type { TransitionEvent } from "react";

/** Wheel colours in segment order, alternating dark and light text so neighbours stand apart. */
export const WHEEL_COLOURS = ["tomato", "marigold", "sea", "plum", "leaf", "denim", "rose"] as const;
/** The text token that passes AA on each colour. A test checks the ratios. */
export const WHEEL_TEXT: Record<(typeof WHEEL_COLOURS)[number], "on-wheel-dark" | "on-wheel-light"> = {
  tomato: "on-wheel-light",
  marigold: "on-wheel-dark",
  sea: "on-wheel-dark",
  plum: "on-wheel-light",
  leaf: "on-wheel-dark",
  denim: "on-wheel-light",
  rose: "on-wheel-dark",
};
// Full class names, so Tailwind sees them.
const FILL = {
  tomato: "fill-wheel-tomato",
  marigold: "fill-wheel-marigold",
  sea: "fill-wheel-sea",
  plum: "fill-wheel-plum",
  leaf: "fill-wheel-leaf",
  denim: "fill-wheel-denim",
  rose: "fill-wheel-rose",
  "on-wheel-dark": "fill-on-wheel-dark",
  "on-wheel-light": "fill-on-wheel-light",
};

const C = 160;
const R = 150;
const MAX_CHARS = 13;
const PLACEHOLDER = Array.from({ length: 10 }, () => "");

/** Segment i's colour. When the last segment would repeat the first, it takes one that differs from both neighbours. */
export function segmentColour(i: number, n: number) {
  return WHEEL_COLOURS[n > 1 && n % WHEEL_COLOURS.length === 1 && i === n - 1 ? 2 : i % WHEEL_COLOURS.length];
}

function point(deg: number, r: number) {
  const a = (deg * Math.PI) / 180;
  return `${(C + r * Math.sin(a)).toFixed(2)} ${(C - r * Math.cos(a)).toFixed(2)}`;
}

function short(name: string) {
  const chars = Array.from(name);
  return chars.length > MAX_CHARS ? `${chars.slice(0, MAX_CHARS - 1).join("")}…` : name;
}

type Props = {
  /** Segment labels, up to 20. Empty shows a blank wheel. */
  names: string[];
  /** Degrees clockwise, from wheelRotation. */
  rotation: number;
  onSpinEnd: () => void;
};

/** The multicolour spinner. It only animates to the rotation it's given; the pick is made before. */
export function Wheel({ names, rotation, onSpinEnd }: Props) {
  const labels = names.length ? names : PLACEHOLDER;
  const n = labels.length;
  const seg = 360 / n;
  const ended = (e: TransitionEvent) => e.target === e.currentTarget && onSpinEnd();

  return (
    <div className="relative mx-auto w-full max-w-[22rem]" aria-hidden="true">
      <div
        className="transition-transform duration-[4000ms] ease-[cubic-bezier(0.15,0.75,0.1,1)] motion-reduce:transition-none"
        style={{ transform: `rotate(${rotation}deg)` }}
        onTransitionEnd={ended}
      >
        <svg viewBox="0 0 320 320" className="block w-full">
          {labels.map((name, i) => {
            const colour = segmentColour(i, n);
            const mid = (i + 0.5) * seg;
            return (
              <g key={i}>
                {n === 1 ? (
                  <circle cx={C} cy={C} r={R} className={FILL[colour]} />
                ) : (
                  <path
                    d={`M ${C} ${C} L ${point(i * seg, R)} A ${R} ${R} 0 ${seg > 180 ? 1 : 0} 1 ${point((i + 1) * seg, R)} Z`}
                    className={FILL[colour]}
                  />
                )}
                {name && (
                  <text
                    x={C + R - 10}
                    y={C}
                    transform={`rotate(${mid - 90} ${C} ${C})`}
                    textAnchor="end"
                    dominantBaseline="central"
                    className={`text-body-sm font-semibold ${FILL[WHEEL_TEXT[colour]]}`}
                  >
                    {short(name)}
                  </text>
                )}
              </g>
            );
          })}
          <circle cx={C} cy={C} r={R} fill="none" strokeWidth="4" className="stroke-wheel-rim" />
          <circle cx={C} cy={C} r="16" strokeWidth="4" className="fill-surface-label stroke-wheel-rim" />
        </svg>
      </div>
      {/* The pointer stays still at the top. */}
      <svg viewBox="0 0 32 32" className="absolute top-0 left-1/2 w-8 -translate-x-1/2 -translate-y-1/4">
        <path d="M 4 4 L 28 4 L 16 28 Z" strokeWidth="2" strokeLinejoin="round" className="fill-wheel-rim stroke-surface-label" />
      </svg>
    </div>
  );
}
