"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { XpBar } from "@/components/ui/XpBar";
import type { Section } from "@/lib/game/visibility";
import { PrefsButtons } from "@/components/PrefsControls";
import { useGame } from "./GameProvider";

type IconName = "today" | "inbox" | "journal" | "diary" | "quests" | "calendar" | "world" | "skills" | "trophies" | "shop" | "wallet" | "settings" | "more";

function Icon({ name }: { name: IconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const };
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden>
      {name === "today" && <path {...common} d="M13 2 4 14h7l-1 8 9-12h-7z" />}
      {name === "quests" && <path {...common} d="M5 22V3h12l-2.5 4.5L17 12H5" />}
      {name === "journal" && <path {...common} d="M5 3h12l2 2v16H5zM9 8h6M9 12h6M9 16h4" />}
      {name === "diary" && <path {...common} d="M4 20h4L20 8l-4-4L4 16zM14 6l4 4M4 20h16" />}
      {name === "inbox" && <path {...common} d="M3 13l3-8h12l3 8v7H3zM3 13h5l1 3h6l1-3h5" />}
      {name === "calendar" && (
        <g {...common}>
          <rect x="3" y="5" width="18" height="16" />
          <path d="M3 10h18M8 3v4M16 3v4M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2" />
        </g>
      )}
      {name === "wallet" && (
        <g {...common}>
          <path d="M3 7h16v13H3zM3 7l12-4v4" />
          <path d="M14 12h7v4h-7z" />
        </g>
      )}
      {name === "more" && (
        <g {...common}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </g>
      )}
      {name === "world" && (
        <g {...common}>
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
          <path d="M3 12h18" />
        </g>
      )}
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
export function AppShell({ children, accountActions, notice }: { children: ReactNode; accountActions?: ReactNode; notice?: ReactNode }) {
  const { basePath, mode, canEdit, summary, data, progress, goldBalance } = useGame();
  const badge = (href: string) =>
    href === `${basePath}/inbox` && data.pendingImports > 0 ? (
      <span className="ml-auto bg-volt px-1.5 font-display text-sm leading-tight text-ink" aria-label={`${data.pendingImports} waiting`}>
        {data.pendingImports}
      </span>
    ) : null;
  const pathname = usePathname();
  const root = basePath || "/";
  const isVisitor = mode === "visitor";
  const shown = (section: Section) => !isVisitor || data.visibility.sections[section];
  // primary = a main phone tab for you; visitorPrimary = a main phone tab for visitors.
  const all: (NavItem & { ownerOnly?: boolean; primary?: boolean; visitorPrimary?: boolean; section?: Section })[] = [
    { href: root, label: isVisitor ? "Profile" : "Today", icon: "today", primary: true, visitorPrimary: true },
    { href: `${basePath}/inbox`, label: "Inbox", icon: "inbox", ownerOnly: true },
    { href: `${basePath}/quests`, label: "Quests", icon: "quests", primary: true, section: "quests" },
    { href: `${basePath}/journal`, label: "Journal", icon: "journal", visitorPrimary: true, section: "journal" },
    { href: `${basePath}/diary`, label: "Diary", icon: "diary", ownerOnly: true },
    { href: `${basePath}/calendar`, label: "Calendar", icon: "calendar", ownerOnly: true, primary: true },
    { href: `${basePath}/world`, label: "World", icon: "world", visitorPrimary: true, section: "world" },
    { href: `${basePath}/skills`, label: "Skills", icon: "skills", section: "skills" },
    { href: `${basePath}/trophies`, label: "Trophies", icon: "trophies", visitorPrimary: true, section: "trophies" },
    { href: `${basePath}/shop`, label: "Shop", icon: "shop", ownerOnly: true },
    { href: `${basePath}/wallet`, label: "Wallet", icon: "wallet", ownerOnly: true, primary: true },
  ];
  const items = all.filter((i) => (canEdit || !i.ownerOnly) && (!i.section || shown(i.section)));
  const isActive = (href: string) => (href === root ? pathname === root : pathname.startsWith(href));
  const settingsHref = mode === "owner" ? "/settings" : null;
  // Phones: up to 5 tabs fit; with more, show the main ones plus a "More" sheet.
  const useMore = items.length > 5;
  const phoneTabs = useMore ? items.filter((i) => (isVisitor ? i.visitorPrimary : i.primary)) : items;
  const moreItems = useMore ? items.filter((i) => !phoneTabs.includes(i)) : [];
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);
  const moreActive = moreItems.some((i) => isActive(i.href)) || (settingsHref !== null && pathname.startsWith(settingsHref));

  return (
    <div className="min-h-dvh lg:pl-60">
      {(mode === "preview" || notice) && (
        <section aria-label="Notice" className="stripes sticky top-0 z-30 px-4 py-1.5 text-center font-label text-xs font-extrabold tracking-[0.12em] text-paper uppercase sm:text-sm sm:tracking-[0.2em]">
          {notice ?? "Preview · sample data · nothing is saved"}
        </section>
      )}

      {/* ---------- Sidebar (big screens) ---------- */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r-4 border-crimson bg-ink-2 lg:flex">
        <div className="shrink-0 px-5 pt-6 pb-5">
          <Link href={root} className="group flex items-end gap-3">
            <span className="halftone-red skew-box -rotate-3 px-3 pt-1 font-display text-4xl leading-tight text-paper shadow-[4px_4px_0_var(--paper)]">
              {summary.overall.level}
            </span>
            <span className="min-w-0">
              <span className="block font-label text-[11px] font-extrabold tracking-[0.25em] text-crimson-text uppercase">Life RPG</span>
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

        <nav aria-label="Main" className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-1 [scrollbar-color:var(--ink-3)_transparent] [scrollbar-width:thin]">
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
              {badge(item.href)}
            </Link>
          ))}
        </nav>

        <div className="shrink-0 space-y-1 border-t border-ink-3 px-3 py-4 font-label text-sm font-extrabold tracking-widest text-muted uppercase">
          {mode === "owner" && (
            <Link href="/showcase" className="flex items-center gap-3 px-5 py-2 hover:text-paper">
              <Icon name="world" />
              View as visitor
            </Link>
          )}
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
          <PrefsButtons className="px-3" />
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
        {!useMore && <PrefsButtons className="font-label text-xs font-extrabold tracking-widest text-muted uppercase [&_span]:hidden" />}
        {settingsHref && !useMore && (
          <Link href={settingsHref} aria-label="Settings" className="p-1 text-muted hover:text-paper">
            <Icon name="settings" />
          </Link>
        )}
      </header>

      <div id="main" key={pathname} className="anim-page pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-12">
        {children}
      </div>

      {/* ---------- "More" sheet (phones) ---------- */}
      {moreOpen && (
        <div className="fixed inset-0 z-30 bg-ink/70 lg:hidden" onClick={() => setMoreOpen(false)}>
          <nav
            aria-label="More"
            onClick={(e) => e.stopPropagation()}
            className="slash-panel absolute inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] border-l-4 border-crimson bg-ink-2 p-3"
          >
            <ul className="grid grid-cols-2 gap-2">
              {[
                ...moreItems,
                ...(mode === "owner" ? [{ href: "/showcase", label: "Visitor view", icon: "world" as const }] : []),
                ...(settingsHref ? [{ href: settingsHref, label: "Settings", icon: "settings" as const }] : []),
              ].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={`skew-box flex items-center gap-3 px-4 py-3 font-label text-base font-extrabold tracking-wider uppercase ${
                      isActive(item.href) ? "bg-crimson text-paper" : "bg-ink-3 text-paper"
                    }`}
                  >
                    <Icon name={item.icon} />
                    {item.label}
                    {badge(item.href)}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink-3 px-2 pt-3 font-label text-sm font-extrabold tracking-widest text-muted uppercase">
              <PrefsButtons className="-ml-2" />
              {accountActions}
            </div>
          </nav>
        </div>
      )}

      {/* ---------- Tab bar (phones) ---------- */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t-4 border-crimson bg-ink-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {phoneTabs.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 pt-2 pb-2 font-label text-[10px] font-extrabold tracking-wide uppercase sm:text-[11px] sm:tracking-wider ${
              isActive(item.href) ? "text-paper" : "text-muted"
            }`}
          >
            <span className={`skew-box px-2.5 py-1 ${isActive(item.href) ? "bg-crimson" : ""}`}>
              <Icon name={item.icon} />
            </span>
            {item.label}
          </Link>
        ))}
        {useMore && (
          <button
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            aria-label="More sections"
            className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 pt-2 pb-2 font-label text-[10px] font-extrabold tracking-wide uppercase sm:text-[11px] sm:tracking-wider ${
              moreActive || moreOpen ? "text-paper" : "text-muted"
            }`}
          >
            <span className={`relative skew-box px-2.5 py-1 ${moreActive ? "bg-crimson" : moreOpen ? "bg-ink-3" : ""}`}>
              <Icon name="more" />
              {canEdit && data.pendingImports > 0 && <span aria-label="Imports waiting" className="absolute -top-0.5 right-0.5 h-2.5 w-2.5 rotate-45 bg-volt" />}
            </span>
            More
          </button>
        )}
      </nav>
    </div>
  );
}
