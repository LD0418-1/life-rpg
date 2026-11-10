import type { ReactNode } from "react";

/** Big tilted page title used at the top of every section. */
export function PageHeader({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-label text-sm font-extrabold tracking-[0.3em] text-crimson-text uppercase">{kicker}</p>
        <h1 className="-rotate-1 font-display text-5xl leading-none uppercase sm:text-6xl">{title}</h1>
      </div>
      {children}
    </header>
  );
}
