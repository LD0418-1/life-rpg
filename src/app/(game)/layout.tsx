import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LiveGame } from "@/components/game/LiveGame";
import { loadSheet } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Always render fresh: the pages depend on who's logged in and today's data.
export const dynamic = "force-dynamic";

/** Loads the game once for every page (Today, Quests, Skills, Trophies, Shop, Settings). */
export default async function GameLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) redirect("/preview");

  const result = await loadSheet();
  if (result.kind === "sheet") {
    return (
      <LiveGame initial={result.sheet} isOwner={result.isOwner}>
        {children}
      </LiveGame>
    );
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <p className="font-label text-base font-semibold tracking-[0.3em] text-crimson-text uppercase">Life RPG</p>
        <h1 className="mt-2 -rotate-2 font-display text-6xl uppercase sm:text-8xl">
          Coming <span className="bg-paper px-2 text-ink">soon</span>
        </h1>
        <p className="mt-6 text-muted">
          {result.signedIn ? "You're signed in, but you're not the owner of this site." : "This adventure isn't public yet."}
        </p>
        <Link href="/login" className="mt-8 inline-block font-label font-extrabold tracking-widest text-muted uppercase hover:text-paper">
          Owner login
        </Link>
      </div>
    </main>
  );
}
