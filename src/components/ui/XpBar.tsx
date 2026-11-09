/** A slanted progress bar. `progress` is 0 to 1. */
export function XpBar({
  progress,
  label,
  size = "md",
  tone = "crimson",
}: {
  progress: number;
  label: string;
  size?: "sm" | "md" | "lg";
  tone?: "crimson" | "volt";
}) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const height = { sm: "h-2.5", md: "h-4", lg: "h-6" }[size];
  const fill = tone === "volt" ? "bg-volt" : "bg-crimson";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={`skew-box relative w-full overflow-hidden bg-ink-3 ${height}`}
    >
      <div className={`h-full ${fill} transition-[width] duration-500 ease-out`} style={{ width: `${pct}%` }} />
      {/* tick marks every 10% */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 calc(10% - 2px), var(--ink) calc(10% - 2px) 10%)" }}
      />
    </div>
  );
}
