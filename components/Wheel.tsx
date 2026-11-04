import type { CSSProperties, TransitionEvent } from "react";
import { lightTimings, WHEEL_BULBS } from "@/lib/look";
import { SPIN_MS } from "@/lib/near-me";

/** Segment colours per look: --seg-1 to --seg-6 and their --seg-N-text in app/lapar-tokens.css. A test checks the ratios. */
export const SEGMENT_COLOURS = 6;

const C = 160;
const R = 150;
const MAX_CHARS = 13;
const PLACEHOLDER = Array.from({ length: 10 }, () => "");
const BULB_R = 0.967 * R;
const base = import.meta.env.BASE_URL;
const bulbs = lightTimings().wheel;

/** Segment i's colour index. When the last segment would repeat the first, it takes one that differs from both neighbours. */
export function segmentColour(i: number, n: number) {
  return n > 1 && n % SEGMENT_COLOURS === 1 && i === n - 1 ? 2 : i % SEGMENT_COLOURS;
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
  /** False jumps straight to the rotation, for a spin whose animation is skipped. */
  animate: boolean;
  /** True while a spin is under way; the lights coming on skip the wheel bulbs then. */
  spinning: boolean;
  onSpinEnd: () => void;
};

/**
 * The multicolour spinner. It only animates to the rotation it's given; the pick is made before.
 * Both looks are drawn, and CSS on [data-look] shows one: the day rim, or the night plate ring and bulbs.
 */
export function Wheel({ names, rotation, animate, spinning, onSpinEnd }: Props) {
  const labels = names.length ? names : PLACEHOLDER;
  const n = labels.length;
  const seg = 360 / n;
  const ended = (e: TransitionEvent) => e.target === e.currentTarget && onSpinEnd();

  return (
    <div className="relative mx-auto w-full max-w-[300px]" aria-hidden="true" data-spinning={spinning || undefined}>
      <div
        className={
          animate ? "transition-transform ease-[cubic-bezier(0.15,0.75,0.1,1)] motion-reduce:transition-none" : "transition-none"
        }
        style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${SPIN_MS}ms` }}
        onTransitionEnd={ended}
      >
        <svg viewBox="0 0 320 320" className="block w-full">
          <circle cx={C} cy={C} r={R - 1} strokeWidth="2" className="fill-plate stroke-wheel-edge" />
          <g className="wheel-face">
            {labels.map((name, i) => {
              const c = segmentColour(i, n) + 1;
              const mid = (i + 0.5) * seg;
              const fill = { fill: `var(--seg-${c})` };
              return (
                <g key={i}>
                  {n === 1 ? (
                    <circle cx={C} cy={C} r={R} style={fill} strokeWidth="2" className="stroke-seg-stroke" />
                  ) : (
                    <path
                      d={`M ${C} ${C} L ${point(i * seg, R)} A ${R} ${R} 0 ${seg > 180 ? 1 : 0} 1 ${point((i + 1) * seg, R)} Z`}
                      style={fill}
                      strokeWidth="2"
                      className="stroke-seg-stroke"
                    />
                  )}
                  {name && (
                    <text
                      x={C + R - 10}
                      y={C}
                      transform={`rotate(${mid - 90} ${C} ${C})`}
                      textAnchor="end"
                      dominantBaseline="central"
                      style={{ fill: `var(--seg-${c}-text)` }}
                      className="wheel-label font-semibold"
                    >
                      {short(name)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
          {/* The floral melamine rim turns with the wheel. */}
          <image href={`${base}images/wheel-rim-day.png`} x={C - R} y={C - R} width={2 * R} height={2 * R} className="night:hidden" />
        </svg>
      </div>

      {/* The still parts: sheen, night plate ring and bulbs, hub and pointer. */}
      <svg viewBox="0 0 320 320" className="pointer-events-none absolute inset-0 block w-full">
        <defs>
          <radialGradient id="wheel-sheen" cx="35%" cy="28%" r="70%">
            <stop offset="0%" style={{ stopColor: "var(--sheen-hi)", stopOpacity: 0.35 }} />
            <stop offset="45%" style={{ stopColor: "var(--sheen-hi)", stopOpacity: 0.06 }} />
            <stop offset="100%" style={{ stopColor: "var(--sheen-lo)", stopOpacity: 0.12 }} />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={R} fill="url(#wheel-sheen)" className="wheel-face" />
        <g className="day:hidden">
          <circle cx={C} cy={C} r={0.93 * R} fill="none" strokeWidth="6" className="stroke-plate" />
          {bulbs.map((b, k) => {
            const a = (2 * Math.PI * k) / WHEEL_BULBS;
            const [x, y] = [C + BULB_R * Math.sin(a), C - BULB_R * Math.cos(a)];
            return (
              <g key={k} className="wheel-bulb" style={{ "--delay": `${b.delay}ms` } as CSSProperties}>
                <circle cx={x.toFixed(2)} cy={y.toFixed(2)} r="5.5" opacity="0.45" className="fill-bulb" />
                <circle cx={x.toFixed(2)} cy={y.toFixed(2)} r="2.6" className="fill-bulb-core" />
              </g>
            );
          })}
        </g>
        <circle cx={C} cy={C} r="20" strokeWidth="3" className="fill-hub stroke-hub-edge" />
      </svg>
      <svg viewBox="0 0 32 32" className="absolute top-0 left-1/2 w-8 -translate-x-1/2 -translate-y-1/4">
        <path d="M 4 4 L 28 4 L 16 28 Z" strokeWidth="1.5" strokeLinejoin="round" className="fill-pointer stroke-seg-stroke" />
      </svg>
    </div>
  );
}
