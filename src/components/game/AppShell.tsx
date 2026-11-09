"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { XpBar } from "@/components/ui/XpBar";
import { useGame } from "./GameProvider";

type IconName = "today" | "quests" | "skills" | "trophies" | "shop" | "settings";

function Icon({ name }: { name: IconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const };
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden>
      {name === "today" && <path {...common} d="M13 2 4 14h7l-1 8 9-12h-7z" />}
      {name === "quests" && <path {...common} d="M5 22V3h12l-2.5 4.5L17 12H5" />}
      {name === "skills" && (
        <g {...common}>
          <rect x="9" y="2" width="6" height="6" />
          <rect x="2" y="16" width="6" height="6" />
          <rect x="16" y="16" width="6" height="6" />
          <path d="M12 8v4M5 16v-4h14v4" />
        </g>
      )}
      {name === "trophies" && <path {...common} d="M7 3h10v6a5 5 0 0 1-10 0zM7 5H3v2a4 4 0 0 0 4 4M17 5h4v2a4 4 0 0 1-4 4M12 14v4M8 21h8l-1-3H9z" />}
      {name === "shop" && <path {...common} d="M4 8h16l-1.5 13h-13zM8 8V6a4 4 0 0 1 8 0v2" />}
      {name === "settings" && <path {...common} d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" />}
    </svg>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

/** Sidebar on big screens, bottom tab bar on phones. */
export function AppShell({ children, accountActions }: { children: ReactNode; accountActions?: ReactNode }) {
  const { basePath, mode, canEdit, summary, data, progress, goldBalance } = useGame();
  const pathname = usePathname();
  const root = basePath || "/";
  const items: NavItem[] = [
    { href: root, label: "Today", icon: "today" },
    { href: `${basePath}/quests`, label: "Quests", icon: "quests" },
    { href: `${basePath}/skills`, label: "Skills", icon: "skills" },
    { href: `${basePath}/trophies`, label: "Trophies", icon: "trophies" },
    ...(canEdit ? [{ href: `${basePath}/shop`, label: "Shop", icon: "shop" as const }] : []),
  ];
  const isActive = (href: string) => (href === root ? pathname === root : pathname.startsWith(href));
  const settingsHref = mode === "owner" ? "/settings" : null;

  return (
    <div className="min-h-dvh lg:pl-60">
      {mode === "preview" && (
        <div className="stripes sticky top-0 z-30 px-4 py-1.5 text-center font-label text-xs font-extrabold tracking-[0.12em] text-paper uppercase sm:text-sm sm:tracking-[0.2em]">
          Preview · sample data · nothing is saved
        </div>
      )}

      {/* ---------- Sidebar (big screens) ---------- */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r-4 border-crimson bg-ink-2 lg:flex">
        <div className="px-5 pt-6 pb-5">
          <Link href={root} className="group flex items-end gap-3">
            <span className="halftone-red skew-box -rotate-3 px-3 pt-1 font-display text-4xl leading-tight text-paper shadow-[4px_4px_0_var(--paper)]">
              {summary.overall.level}
            </span>
            <span className="min-w-0">
              <span className="block font-label text-[11px] font-extrabold tracking-[0.25em] text-crimson uppercase">Life RPG</span>
              <span className="block truncate font-display text-xl leading-tight uppercase group-hover:text-volt">{data.displayName}</span>
            </span>
          </Link>
          <div className="mt-4">
            <XpBar progress={summary.overall.progress} label="Overall level progress" size="sm" />
            <div className="mt-1 flex justify-between font-label text-xs font-extrabold tracking-wider text-muted uppercase tabular-nums">
              <span>Lv {summary.overall.level}</span>
              <span>
                {summary.overall.xpIntoLevel.toLocaleString()} / {summary.overall.xpForNext.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 font-label text-xs font-extrabold tracking-wider uppercase">
            {canEdit && <span className="skew-box bg-ink-3 px-3 py-0.5 text-volt">◆ {goldBalance.toLocaleString()}</span>}
            {data.streaksReady && progress.streak > 0 && <span className="skew-box bg-crimson px-3 py-0.5">{progress.streak}-day streak</span>}
          </div>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-1 px-3">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`skew-box flex items-center gap-3 px-5 py-2.5 font-label text-lg font-extrabold tracking-wider uppercase transition-colors ${
                isActive(item.href) ? "bg-crimson text-paper" : "text-muted hover:bg-ink-3 hover:text-paper"
              }`}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="space-y-1 border-t border-ink-3 px-3 py-4 font-label text-sm font-extrabold tracking-widest text-muted uppercase">
          {settingsHref && (
            <Link
              href={settingsHref}
              aria-current={pathname.startsWith(settingsHref) ? "page" : undefined}
              className={`flex items-center gap-3 px-5 py-2 hover:text-paper ${pathname.startsWith(settingsHref) ? "text-paper" : ""}`}
            >
              <Icon name="settings" />
              Settings
            </Link>
          )}
          {accountActions && <div className="px-5 py-1">{accountActions}</div>}
        </div>
      </aside>

      {/* ---------- Top bar (phones) ---------- */}
      <header className="flex items-center gap-3 px-4 pt-4 lg:hidden">
        <Link href={root} className="flex min-w-0 flex-1 items-center gap-2">
          <span className="halftone-red skew-box px-2 font-display text-2xl leading-tight text-paper">{summary.overall.level}</span>
          <span className="truncate font-display text-lg uppercase">{data.displayName}</span>
        </Link>
        {canEdit && <span className="font-label text-sm font-extrabold text-volt tabular-nums">◆ {goldBalance.toLocaleString()}</span>}
        {settingsHref && (
          <Link href={settingsHref} aria-label="Settings" className="p-1 text-muted hover:text-paper">
            <Icon name="settings" />
          </Link>
        )}
      </header>

      <div className="pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-12">{children}</div>

      {/* ---------- Tab bar (phones) ---------- */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t-4 border-crimson bg-ink-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 pt-2 pb-2 font-label text-[11px] font-extrabold tracking-wider uppercase ${
              isActive(item.href) ? "text-paper" : "text-muted"
            }`}
          >
            <span className={`skew-box px-3 py-1 ${isActive(item.href) ? "bg-crimson" : ""}`}>
              <Icon name={item.icon} />
            </span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
