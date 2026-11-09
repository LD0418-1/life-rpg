import type { ReactNode } from "react";

/** A dark panel with a sliced corner and a tilted header tab. */
export function Panel({
  title,
  kicker,
  children,
  className = "",
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`relative ${className}`}>
      <header className="relative z-10 -mb-3 ml-2 flex items-end gap-2">
        <h2 className="skew-box -rotate-2 bg-paper px-5 py-1 font-display text-xl tracking-wide text-ink uppercase shadow-[4px_4px_0_var(--crimson)]">
          {title}
        </h2>
        {kicker && <span className="mb-1 font-label text-sm font-semibold tracking-widest text-muted uppercase">{kicker}</span>}
      </header>
      <div className="slash-panel border-l-4 border-crimson bg-ink-2 p-5 pt-7">{children}</div>
    </section>
  );
}
