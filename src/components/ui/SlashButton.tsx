import type { ButtonHTMLAttributes } from "react";

/** A parallelogram button that jolts on hover and press. */
export function SlashButton({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  const look =
    variant === "primary"
      ? "bg-crimson text-paper hover:bg-paper hover:text-ink"
      : "bg-ink-3 text-paper hover:bg-crimson";
  return (
    <button
      {...props}
      className={`skew-box px-5 py-2 font-label text-lg font-extrabold tracking-wider uppercase transition-[transform,background-color,color] duration-100 hover:-translate-y-0.5 hover:-rotate-1 active:translate-y-0.5 active:scale-95 disabled:opacity-40 ${look} ${className}`}
    />
  );
}
