import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Spin is the one main action, action its look for Done; ghost is everything else, small a compact ghost.
      paper and paper-outline are a notice's first and second buttons. */
  variant?: Variant;
};

type Variant = keyof typeof LOOKS;

const spin = "border-2 border-spin-edge bg-spin text-on-spin shadow-spin";
const ghost = "border-(length:--edge) border-ghost-edge bg-ghost text-ink";
const LOOKS = {
  spin: `${spin} min-h-15 px-8 font-sign text-spin-label`,
  action: `${spin} min-h-13 px-6 text-button font-extrabold`,
  ghost: `${ghost} min-h-12 px-6 text-button`,
  small: `${ghost} min-h-9 px-3 text-sub`,
  paper: "border-2 border-paper-edge bg-paper-action text-on-paper-action min-h-12 px-4 text-button font-extrabold",
  "paper-outline": "border-2 border-paper-ink bg-transparent text-paper-ink min-h-12 px-4 text-button",
};

/** A variant's classes, for a link that looks like a button. */
export const buttonClass = (variant: Variant) =>
  `${LOOKS[variant]} inline-flex items-center justify-center rounded-full text-center underline-offset-4 hover:underline active:translate-y-[3px] disabled:cursor-wait disabled:hover:no-underline`;

/** A pill button. Day buttons sink 3px on press. */
export function Button({ variant = "ghost", className = "", ...props }: Props) {
  return (
    <button
      type="button"
      className={`${buttonClass(variant)} ${className}`}
      {...props}
    />
  );
}
