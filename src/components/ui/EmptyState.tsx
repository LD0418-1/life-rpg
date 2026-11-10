import type { ReactNode } from "react";

/** What a section shows while it's empty: a big glyph, a line of text, and what to do next. */
export function EmptyState({ glyph = "◇", title, children, action }: { glyph?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-2 border-dashed border-ink-3 px-4 py-5">
      <span aria-hidden className="grid h-12 w-12 shrink-0 -rotate-6 place-items-center bg-ink-3 font-display text-2xl text-crimson-text">
        {glyph}
      </span>
      <div className="min-w-0">
        <p className="font-display text-xl leading-tight uppercase">{title}</p>
        {children && <div className="mt-1 text-sm text-muted">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
