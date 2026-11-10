// Share cards: PNG images of your profile, a level-up, a defeated boss or a
// season recap, in the site's style. Also used as the link preview image.
//   /api/card?type=profile
//   /api/card?type=level[&domain=body]
//   /api/card?type=boss&id=<questId>
//   /api/card?type=season&id=<seasonId>
// Data comes from the database as the current viewer may see it, so a card
// can never reveal anything private. The preview uses ?demo=1 with sample values.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { gameConfig } from "@/lib/game/config";
import { seasonStats } from "@/lib/game/seasons";
import { computeProgress } from "@/lib/game/streaks";
import { effectiveTheme } from "@/lib/game/themes";
import { summarizeTotals } from "@/lib/game/xp";
import { loadSheet } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const INK = "#0b0b0d";
const INK2 = "#17171b";
const INK3 = "#26262c";
const PAPER = "#f5f2ea";
const MUTED = "#a7a3ab";
const VOLT = "#ffd60a";

let fonts: { name: string; data: Buffer; weight: 400 | 800; style: "normal" }[] | null = null;
async function loadFonts() {
  if (!fonts) {
    const dir = join(process.cwd(), "src/assets/fonts");
    const [anton, barlow, inter] = await Promise.all([readFile(join(dir, "anton.woff")), readFile(join(dir, "barlow-800.woff")), readFile(join(dir, "inter-400.woff"))]);
    fonts = [
      { name: "Anton", data: anton, weight: 400, style: "normal" },
      { name: "Barlow", data: barlow, weight: 800, style: "normal" },
      { name: "Inter", data: inter, weight: 400, style: "normal" },
    ];
  }
  return fonts;
}

const label = (size: number, color = MUTED) => ({ fontFamily: "Barlow", fontSize: size, letterSpacing: size * 0.18, textTransform: "uppercase" as const, color });

function Frame({ accent, children, sample }: { accent: string; children: React.ReactNode; sample?: boolean }) {
  return (
    <div
      style={{
        width: "100%", height: "100%", display: "flex", position: "relative", background: INK, color: PAPER, fontFamily: "Inter",
        backgroundImage: `radial-gradient(${INK3} 2px, transparent 2.5px)`, backgroundSize: "18px 18px",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 18, background: accent, display: "flex" }} />
      {children}
      <div style={{ position: "absolute", right: 48, bottom: 30, display: "flex", ...label(22) }}>Life RPG{sample ? " · sample" : ""}</div>
    </div>
  );
}

function Chip({ text, bg = INK3, color = PAPER }: { text: string; bg?: string; color?: string }) {
  return <div style={{ display: "flex", background: bg, padding: "8px 22px", marginRight: 16, ...label(28, color), letterSpacing: 3 }}>{text}</div>;
}

function generic(accent: string, title: string, sub: string) {
  return (
    <Frame accent={accent}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 90px", flex: 1 }}>
        <div style={{ display: "flex", ...label(34, accent) }}>Life RPG</div>
        <div style={{ display: "flex", fontFamily: "Anton", fontSize: 150, lineHeight: 1.05, textTransform: "uppercase" }}>{title}</div>
        <div style={{ display: "flex", fontSize: 34, color: MUTED, marginTop: 12 }}>{sub}</div>
      </div>
    </Frame>
  );
}

function profileCard(p: { accent: string; name: string; title: string | null; level: number; progress: number; totalXp: number; streak: number | null; trophies: number | null; domains: { label: string; level: number }[]; sample?: boolean }) {
  return (
    <Frame accent={p.accent} sample={p.sample}>
      <div style={{ display: "flex", alignItems: "center", padding: "0 70px 0 90px", flex: 1 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: p.accent, padding: "24px 44px 18px", transform: "rotate(-4deg)", boxShadow: `16px 16px 0 ${PAPER}` }}>
          <div style={{ display: "flex", ...label(38, PAPER) }}>Level</div>
          <div style={{ display: "flex", fontFamily: "Anton", fontSize: 230, lineHeight: 1, color: PAPER }}>{p.level}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 80, flex: 1 }}>
          <div style={{ display: "flex", ...label(30, p.accent) }}>Life RPG</div>
          <div style={{ display: "flex", fontFamily: "Anton", fontSize: p.name.length > 14 ? 84 : 112, lineHeight: 1, textTransform: "uppercase" }}>{p.name}</div>
          {p.title && <div style={{ display: "flex", ...label(34), letterSpacing: 2, marginTop: 10 }}>{p.title}</div>}
          <div style={{ display: "flex", height: 26, background: INK3, marginTop: 28, width: "100%" }}>
            <div style={{ display: "flex", height: 26, width: `${Math.round(p.progress * 100)}%`, background: p.accent }} />
          </div>
          <div style={{ display: "flex", marginTop: 22 }}>
            <Chip text={`${p.totalXp.toLocaleString("en")} XP`} />
            {p.streak !== null && p.streak > 0 && <Chip text={`${p.streak}-day streak`} bg={p.accent} />}
            {p.trophies !== null && <Chip text={`${p.trophies} trophies`} bg={VOLT} color={INK} />}
          </div>
          <div style={{ display: "flex", marginTop: 30 }}>
            {p.domains.map((d) => (
              <div key={d.label} style={{ display: "flex", flexDirection: "column", marginRight: 34 }}>
                <div style={{ display: "flex", ...label(22) }}>{d.label}</div>
                <div style={{ display: "flex", fontFamily: "Anton", fontSize: 44, lineHeight: 1 }}>{d.level}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

function levelCard(p: { accent: string; name: string; scope: string; level: number; sample?: boolean }) {
  return (
    <Frame accent={p.accent} sample={p.sample}>
      <div style={{ position: "absolute", left: -60, right: -60, top: 170, height: 250, display: "flex", transform: "rotate(-4deg)", background: p.accent }} />
      <div style={{ position: "absolute", left: -60, right: -60, top: 432, height: 26, display: "flex", transform: "rotate(-4deg)", background: PAPER }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, transform: "rotate(-4deg)" }}>
        <div style={{ display: "flex", fontFamily: "Anton", fontSize: 200, lineHeight: 1, color: PAPER, textShadow: `10px 10px 0 ${INK}` }}>LEVEL UP!</div>
        <div style={{ display: "flex", background: INK, padding: "10px 30px", marginTop: 26, ...label(48, VOLT) }}>{`${p.scope} → Lv ${p.level}`}</div>
        <div style={{ display: "flex", fontFamily: "Anton", fontSize: 54, marginTop: 30, textTransform: "uppercase" }}>{p.name}</div>
      </div>
    </Frame>
  );
}

function bossCard(p: { accent: string; name: string; quest: string; xp: number; gold: number; day: string | null; sample?: boolean }) {
  return (
    <Frame accent={p.accent} sample={p.sample}>
      <div style={{ position: "absolute", left: -60, right: -60, top: 110, height: 360, display: "flex", transform: "rotate(-3deg)", background: VOLT }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, transform: "rotate(-3deg)", color: INK, padding: "0 80px 70px" }}>
        <div style={{ display: "flex", ...label(40, INK), letterSpacing: 18 }}>Boss</div>
        <div style={{ display: "flex", fontFamily: "Anton", fontSize: 170, lineHeight: 1, textShadow: `8px 8px 0 ${PAPER}` }}>DEFEATED!</div>
        <div style={{ display: "flex", fontFamily: "Anton", fontSize: p.quest.length > 28 ? 46 : 60, marginTop: 14, textTransform: "uppercase", textAlign: "center" }}>{p.quest}</div>
      </div>
      <div style={{ position: "absolute", left: 90, bottom: 60, display: "flex", alignItems: "center" }}>
        <div style={{ display: "flex", background: INK2, padding: "10px 26px", ...label(34, VOLT), letterSpacing: 4 }}>{`+${p.xp} XP · ${p.gold} gold`}</div>
        <div style={{ display: "flex", marginLeft: 24, ...label(28) }}>{[p.name, p.day].filter(Boolean).join(" · ")}</div>
      </div>
    </Frame>
  );
}

function seasonCard(p: { accent: string; name: string; season: string; rank: string; xp: number; activeDays: number; days: number; goals: string; levels: string; sample?: boolean }) {
  const stat = (k: string, v: string) => (
    <div style={{ display: "flex", flexDirection: "column", marginRight: 50 }}>
      <div style={{ display: "flex", fontFamily: "Anton", fontSize: 64, lineHeight: 1 }}>{v}</div>
      <div style={{ display: "flex", ...label(24) }}>{k}</div>
    </div>
  );
  return (
    <Frame accent={p.accent} sample={p.sample}>
      <div style={{ display: "flex", alignItems: "center", padding: "0 80px 0 90px", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 280, height: 280, background: p.rank === "S" ? VOLT : p.accent, color: p.rank === "S" ? INK : PAPER, transform: "rotate(-5deg)", fontFamily: "Anton", fontSize: 230, boxShadow: `16px 16px 0 ${PAPER}` }}>
          {p.rank}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 80, flex: 1 }}>
          <div style={{ display: "flex", ...label(30, p.accent) }}>Season recap · {p.name}</div>
          <div style={{ display: "flex", fontFamily: "Anton", fontSize: p.season.length > 16 ? 80 : 104, lineHeight: 1.02, textTransform: "uppercase" }}>{p.season}</div>
          <div style={{ display: "flex", marginTop: 40 }}>
            {stat("XP earned", p.xp.toLocaleString("en"))}
            {stat("Active days", `${p.activeDays}/${p.days}`)}
            {stat("Goals", p.goals)}
            {stat("Level", p.levels)}
          </div>
        </div>
      </div>
    </Frame>
  );
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const type = q.get("type") ?? "profile";
  const size = { width: 1200, height: 630, fonts: await loadFonts() };
  const crimson = "#e3172f";

  // Preview pages: sample values from the URL, clearly marked as a sample.
  if (q.get("demo") === "1") {
    const n = (k: string, d: number) => Math.max(0, Math.min(999999, Number(q.get(k)) || d));
    const s = (k: string, d: string) => (q.get(k) ?? d).slice(0, 60);
    const accent = crimson;
    const el =
      type === "level" ? levelCard({ accent, name: s("name", "Player One"), scope: s("scope", "Overall"), level: n("level", 5), sample: true })
      : type === "boss" ? bossCard({ accent, name: s("name", "Player One"), quest: s("quest", "File this year's taxes"), xp: n("xp", 300), gold: n("gold", 80), day: null, sample: true })
      : type === "season" ? seasonCard({ accent, name: s("name", "Player One"), season: s("season", "Autumn arc"), rank: s("rank", "S").slice(0, 1), xp: n("xp", 6000), activeDays: n("active", 37), days: n("days", 41), goals: s("goals", "1/4"), levels: s("levels", "4 → 6"), sample: true })
      : profileCard({ accent, name: s("name", "Player One"), title: s("title", "Apprentice of many paths"), level: n("level", 5), progress: 0.4, totalXp: n("xp", 5000), streak: n("streak", 22), trophies: n("trophies", 11), domains: gameConfig.domains.map((d) => ({ label: d.label, level: 3 })), sample: true });
    return new ImageResponse(el, { ...size, headers: { "Cache-Control": "public, max-age=3600" } });
  }

  if (!isSupabaseConfigured()) return new ImageResponse(generic(crimson, "Life RPG", "My life, played as a game."), size);
  const result = await loadSheet().catch(() => null);
  if (!result || result.kind !== "sheet") return new ImageResponse(generic(crimson, "Coming soon", "This adventure isn't public yet."), size);

  const sheet = result.sheet;
  const summary = summarizeTotals(sheet.totals);
  const accent = effectiveTheme(sheet.theme, summary.overall.level).accent;
  const vis = sheet.visibility;
  const cache = { "Cache-Control": result.isOwner ? "private, no-store" : "public, max-age=300" };
  const domains = gameConfig.domains.filter((d) => result.isOwner || !vis.hiddenDomains.includes(d.id)).map((d) => ({ label: d.label, level: summary.domains[d.id].level }));

  if (type === "level") {
    const domain = gameConfig.domains.find((d) => d.id === q.get("domain") && (result.isOwner || !vis.hiddenDomains.includes(d.id)));
    const reached = domain ? summary.domains[domain.id].level : summary.overall.level;
    // A past level-up (from the Journal) may ask for an earlier level, but never one you haven't reached.
    const asked = Math.floor(Number(q.get("level")));
    const level = asked >= 2 && asked <= reached ? asked : reached;
    const el = levelCard({ accent, name: sheet.displayName, scope: domain ? domain.label : "Overall", level });
    return new ImageResponse(el, { ...size, headers: cache });
  }

  if (type === "boss") {
    const supabase = await createClient();
    const { data: quest } = await supabase
      .from("quests")
      .select("title, xp_reward, gold_reward, completed_at, is_boss, status")
      .eq("id", q.get("id") ?? "")
      .maybeSingle<{ title: string; xp_reward: number; gold_reward: number; completed_at: string | null; is_boss: boolean; status: string }>();
    if (!quest || !quest.is_boss || quest.status !== "completed") return new ImageResponse(generic(accent, "Not found", "That boss is still standing, or it's private."), { ...size, status: 404 });
    const day = quest.completed_at ? new Date(quest.completed_at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: sheet.timezone }) : null;
    return new ImageResponse(bossCard({ accent, name: sheet.displayName, quest: quest.title, xp: quest.xp_reward, gold: quest.gold_reward, day }), { ...size, headers: cache });
  }

  if (type === "season") {
    const season = sheet.seasons.find((s) => s.id === q.get("id"));
    if (!season) return new ImageResponse(generic(accent, "Not found", "That season doesn't exist, or it's private."), { ...size, status: 404 });
    const goals = [
      ...sheet.quests.filter((x) => x.seasonId === season.id).map((x) => ({ done: Boolean(x.completed) })),
      ...sheet.closedSeasonGoals.filter((g) => g.seasonId === season.id).map((g) => ({ done: g.status === "completed" })),
    ];
    const st = seasonStats(season, sheet.days, sheet.today, sheet.completedOn, goals);
    const el = seasonCard({
      accent, name: sheet.displayName, season: season.name, rank: st.rank, xp: st.xp, activeDays: st.activeDays, days: st.state === "past" ? st.totalDays : st.elapsedDays,
      goals: `${st.goalsDone}/${st.goalsTotal}`, levels: st.levelNow > st.levelAtStart ? `${st.levelAtStart} → ${st.levelNow}` : String(st.levelNow),
    });
    return new ImageResponse(el, { ...size, headers: cache });
  }

  const showStreak = (result.isOwner || vis.sections.streak) && sheet.streaksReady;
  const showTrophies = result.isOwner || vis.sections.trophies;
  const el = profileCard({
    accent, name: sheet.displayName, title: sheet.title, level: summary.overall.level, progress: summary.overall.progress, totalXp: summary.overall.totalXp,
    streak: showStreak ? computeProgress(sheet.days, sheet.restDays, sheet.today).streak : null,
    trophies: showTrophies ? Object.keys(sheet.achievements.unlocked).length : null,
    domains,
  });
  return new ImageResponse(el, { ...size, headers: cache });
}
