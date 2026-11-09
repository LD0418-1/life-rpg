import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { updateProfileAction } from "@/app/actions";
import { Panel } from "@/components/ui/Panel";
import { SlashButton } from "@/components/ui/SlashButton";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { ProfileRow } from "@/lib/supabase/rows";
import { createClient } from "@/lib/supabase/server";
import { loadTotals } from "@/lib/data";
import { THEMES, effectiveTheme } from "@/lib/game/themes";
import { summarizeTotals } from "@/lib/game/xp";

export const metadata: Metadata = { title: "Settings · Life RPG" };
export const dynamic = "force-dynamic";

const fieldClass = "w-full bg-ink-3 px-3 py-2 text-paper outline-none focus:ring-2 focus:ring-crimson";
const labelClass = "mb-1 block font-label text-sm font-extrabold tracking-widest text-muted uppercase";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  if (!isSupabaseConfigured()) redirect("/preview");
  const supabase = await createClient();
  const { data: isOwner } = await supabase.rpc("is_owner");
  if (isOwner !== true) redirect("/login");

  const [{ data: profile, error: loadError }, totals] = await Promise.all([
    supabase.from("profile").select("*").single<ProfileRow>(),
    loadTotals(supabase),
  ]);
  if (loadError) throw new Error(`Could not load your profile: ${loadError.message}`);
  const level = summarizeTotals(totals).overall.level;
  const themesReady = typeof profile.theme === "string";
  const currentTheme = effectiveTheme(profile.theme, level).id;
  const { saved, error } = await searchParams;

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8">
      <h1 className="mb-10 -rotate-2 font-display text-6xl uppercase">
        Set<span className="bg-crimson px-1">tings</span>
      </h1>

      {saved && (
        <p role="status" className="skew-box mb-6 bg-paper px-6 py-2 font-label font-extrabold tracking-wider text-ink uppercase">
          Saved ✓
        </p>
      )}
      {error && (
        <p role="alert" className="skew-box mb-6 bg-paper px-6 py-2 text-sm text-ink">
          <span className="mr-2 font-label font-extrabold tracking-wider text-crimson uppercase">Error</span>
          {error}
        </p>
      )}

      <form action={updateProfileAction} className="space-y-10">
        <Panel title="Character">
          <div className="space-y-4">
            <div>
              <label htmlFor="display_name" className={labelClass}>Name</label>
              <input id="display_name" name="display_name" required maxLength={40} defaultValue={profile.display_name} className={`${fieldClass} font-display text-2xl uppercase`} />
            </div>
            <div>
              <label htmlFor="title" className={labelClass}>Title · optional</label>
              <input id="title" name="title" maxLength={60} defaultValue={profile.title ?? ""} placeholder="Apprentice of many paths" className={fieldClass} />
            </div>
            <div>
              <label htmlFor="bio" className={labelClass}>Bio · optional</label>
              <textarea id="bio" name="bio" rows={3} maxLength={280} defaultValue={profile.bio ?? ""} placeholder="One or two lines about you and what you're working toward." className={fieldClass} />
            </div>
          </div>
        </Panel>

        <Panel title="Visibility">
          <label className="flex cursor-pointer items-start gap-4">
            <input type="checkbox" name="is_public" defaultChecked={profile.is_public} className="peer sr-only" />
            <span
              aria-hidden
              className="skew-box mt-1 flex h-7 w-14 shrink-0 items-center bg-ink-3 px-1 transition-colors peer-checked:bg-crimson peer-focus-visible:ring-2 peer-focus-visible:ring-volt [&>span]:transition-transform peer-checked:[&>span]:translate-x-6"
            >
              <span className="h-5 w-5 bg-paper" />
            </span>
            <span>
              <span className="block font-label text-lg font-extrabold tracking-wider uppercase">Public profile</span>
              <span className="block text-sm text-muted">
                When on, anyone with your site&apos;s link sees your level, stats, quests and log, read-only. Your gold
                stays hidden. When off, visitors see &ldquo;Coming soon&rdquo;.
              </span>
            </span>
          </label>
        </Panel>

        <Panel title="Theme" kicker="Unlocked by leveling up">
          {themesReady ? (
            <fieldset>
              <legend className="sr-only">Accent color</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {THEMES.map((t) => {
                  const locked = t.level > level;
                  return (
                    <label
                      key={t.id}
                      className={`skew-box flex items-center gap-3 px-4 py-2 has-[:checked]:bg-paper has-[:checked]:text-ink has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-volt ${
                        locked ? "cursor-not-allowed bg-ink-3/50 text-muted" : "cursor-pointer bg-ink-3"
                      }`}
                    >
                      <input type="radio" name="theme" value={t.id} defaultChecked={t.id === currentTheme} disabled={locked} className="sr-only" />
                      <span aria-hidden className="h-5 w-5 shrink-0 rotate-45" style={{ background: locked ? "var(--ink-3)" : t.accent }} />
                      <span className="font-label font-extrabold tracking-wider uppercase">
                        {t.name}
                        {locked && <span className="block text-xs">Lv {t.level}</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-3 text-sm text-muted">You&apos;re level {level}. Visitors see your theme too.</p>
            </fieldset>
          ) : (
            <p className="text-sm text-muted">
              Themes need a one-time database update: run <code>supabase/migrations/0004_depth.sql</code> in the Supabase SQL Editor.
            </p>
          )}
        </Panel>

        <Panel title="Time zone">
          <p className="text-sm">
            <span className="font-label text-lg font-extrabold tracking-wider">{profile.timezone}</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            Decides when your day resets for dailies and repeat XP. It updates automatically to the device you log in from.
          </p>
        </Panel>

        <SlashButton type="submit" className="w-full">Save settings</SlashButton>
      </form>
    </main>
  );
}
