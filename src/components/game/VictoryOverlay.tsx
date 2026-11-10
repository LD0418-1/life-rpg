"use client";

import { type ReactNode, useEffect, useState } from "react";

export interface VictoryEvent {
  key: number;
  questId: string;
  title: string;
  xp: number;
  gold: number;
}

/** Full-screen "BOSS DEFEATED" moment. Closes itself, or on click / Escape. */
export function VictoryOverlay({ event, onDone, share }: { event: VictoryEvent; onDone: () => void; share?: ReactNode }) {
  // Tapping "Share" keeps the screen open until you close it.
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const timer = pinned ? undefined : setTimeout(onDone, 3200);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone();
    window.addEventListener("keydown", onKey);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [event.key, onDone, pinned]);

  return (
    <div role="alert" onClick={onDone} className="fixed inset-0 z-[60] flex cursor-pointer items-center justify-center overflow-hidden bg-ink/90">
      <div className="anim-slash-in absolute inset-x-[-20%] top-1/2 h-64 -translate-y-1/2 bg-volt" />
      <div className="anim-slash-in stripes absolute inset-x-[-20%] top-1/2 h-10 translate-y-28 [animation-delay:80ms]" />
      <div className="anim-stamp relative px-4 text-center">
        <div className="font-label text-lg font-extrabold tracking-[0.4em] text-ink uppercase">Boss</div>
        <div className="font-display text-7xl leading-none text-ink uppercase drop-shadow-[5px_5px_0_var(--paper)] sm:text-9xl">Defeated!</div>
        <div className="mx-auto mt-4 max-w-xl font-display text-2xl break-words text-ink uppercase sm:text-3xl">{event.title}</div>
        <div className="mt-4 inline-block bg-ink px-5 py-1 font-label text-xl font-extrabold tracking-widest text-volt uppercase">
          +{event.xp} XP · ◆ {event.gold} gold
        </div>
        {share && (
          <div className="mt-6 flex justify-center gap-3" onClickCapture={() => setPinned(true)}>
            {share}
            {pinned && <span className="self-center font-label text-sm font-extrabold tracking-widest text-ink uppercase">Tap anywhere to close</span>}
          </div>
        )}
      </div>
    </div>
  );
}
