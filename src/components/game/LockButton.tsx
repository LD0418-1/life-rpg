"use client";

/** Lock toggle for one quest or log entry: locked = only you see it. */
export function LockButton({ isPublic, onToggle, disabled, what }: { isPublic: boolean; onToggle: () => void; disabled?: boolean; what: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={!isPublic}
      aria-label={isPublic ? `${what} is public. Make it private` : `${what} is private (only you). Make it public`}
      title={isPublic ? "Public: tap to make private" : "Private: only you see this"}
      className={`p-1 ${isPublic ? "text-muted opacity-50 hover:opacity-100" : "text-volt"}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden fill="none" stroke="currentColor" strokeWidth={2.2}>
        <rect x="5" y="11" width="14" height="10" />
        <path d={isPublic ? "M8 11V7a4 4 0 0 1 7.5-2" : "M8 11V7a4 4 0 0 1 8 0v4"} />
      </svg>
    </button>
  );
}
