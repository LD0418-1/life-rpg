import type { Metadata } from "next";
import { HomeView } from "@/components/game/views/HomeView";
import { loadSheet } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Link previews (chat apps, social sites) show your profile card. Private profiles get a neutral "Coming soon" card.
export async function generateMetadata(): Promise<Metadata> {
  if (!isSupabaseConfigured()) return {};
  const result = await loadSheet({ asVisitor: true }).catch(() => null);
  const name = result?.kind === "sheet" ? result.sheet.displayName : null;
  const title = name ? `${name} · Life RPG` : "Life RPG";
  const description = result?.kind === "sheet" ? (result.sheet.title ?? "My life, played as a game.") : "My life, played as a game.";
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: "/api/card?type=profile", width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: ["/api/card?type=profile"] },
  };
}

export default function Page() {
  return <HomeView />;
}
