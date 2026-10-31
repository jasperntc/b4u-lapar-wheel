import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Primary is the one main action on a screen; outline is everything else. */
  variant?: "primary" | "outline";
  /** The pill shape belongs to the wheel's spin button only. */
  pill?: boolean;
};

/** A brand button: shadow-press, sinking 3px on press. */
export function Button({ variant = "outline", pill = false, className = "", ...props }: Props) {
  const look =
    variant === "primary"
      ? "bg-stamp text-on-stamp"
      : "border-2 border-stamp bg-surface-label text-stamp";
  return (
    <button
      type="button"
      className={`${look} ${pill ? "rounded-pill px-12 py-4" : "rounded-md px-6 py-3"} inline-flex items-center justify-center text-button shadow-press underline-offset-4 hover:underline active:translate-y-[3px] active:shadow-none disabled:cursor-wait disabled:hover:no-underline ${className}`}
      {...props}
    />
  );
}
