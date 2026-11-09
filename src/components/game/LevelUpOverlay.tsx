"use client";

import { useEffect } from "react";

export interface LevelUpEvent {
  key: number;
  scope: string; // "Overall" or a domain label
  level: number;
}

/** Full-screen "LEVEL UP" moment. Closes itself, or on click / Escape. */
export function LevelUpOverlay({ event, onDone }: { event: LevelUpEvent; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2300);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [event.key, onDone]);

  return (
    <div
      role="alert"
      onClick={onDone}
      className="anim-fade-out fixed inset-0 z-50 flex cursor-pointer items-center justify-center overflow-hidden bg-ink/80"
    >
      <div className="anim-slash-in stripes absolute inset-x-[-20%] top-1/2 h-56 -translate-y-1/2" />
      <div className="anim-slash-in absolute inset-x-[-20%] top-1/2 h-20 translate-y-16 bg-paper [animation-delay:60ms]" />
      <div className="anim-stamp relative text-center">
        <div className="font-display text-7xl leading-none text-paper uppercase drop-shadow-[6px_6px_0_var(--ink)] sm:text-9xl">
          Level up!
        </div>
        <div className="mt-6 inline-block bg-ink px-5 py-1 font-label text-2xl font-extrabold tracking-widest text-volt uppercase">
          {event.scope} → Lv {event.level}
        </div>
      </div>
    </div>
  );
}
