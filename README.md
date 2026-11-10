# Life RPG

My life, played as a game. It's a motivation engine that keeps me on track, and a public showcase of what I've done.

**Status:** Phases 0–8 done (see the roadmap). Everything is saved in Supabase. Without Supabase settings, the home page falls back to an interactive **preview with sample data**, which is also always available at `/preview`. See [ROADMAP.md](ROADMAP.md).

### Pages
A sidebar on big screens and a tab bar on phones link these sections:
- `/` **Today** (when you're logged in): your character, quick log, streak, dailies, recent log. Visitors see your **public showcase** here instead.
- `/quests`: the current season (goals, day count, rank so far), past season recaps, then bosses, main and side quests.
- `/world`: the world map. One region per domain, with buildings that grow in 6 stages as the domain levels up.
- `/skills`: stats radar, level unlocks (color themes) and skill trees.
- `/trophies`: achievements. Hidden ones show as "???" until earned.
- `/journal`: the **weekly recap** on top, then a timeline by month or season with level-ups, trophies, skills, season milestones and diary notes. Lock any entry to keep it private.
- `/diary` (owner only): free-form notes with a mood and title, by month, with search. Private unless you make an entry public.
- `/showcase`: your public page exactly as a logged-out visitor sees it. Also linked as "View as visitor".
- `/inbox` (owner only): imports from GitHub, Strava and Apple Health waiting for your approval, plus connection settings.
- `/calendar` (owner only): your Google / Apple calendars (via their private iCal links), plus Life RPG days: XP, rest days, quests cleared, seasons.
- `/shop` (owner only): the loot shop and your inventory, with shop purchases and custom quest rewards. "Use it" can log what it cost to the wallet.
- `/wallet` (owner only): income and spending by category and day, monthly budget, entries by month.
- `/settings` (owner only): name, title, bio, theme, public profile switch.
- `/login`: the owner login.
- `/preview/...`: the same pages running on sample data in your browser, so nothing is saved.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # game-logic tests
npm run lint
```

## How the code is organized

```
src/
  config/xp.json              ← ALL scoring rules. Tweak numbers here to rebalance.
                                (Activities can also be edited in the app: Today → Quick log → ✎ Edit.)
  lib/game/
    config.ts                 loads + checks xp.json (typos give a clear error)
    xp.ts                     the game math: levels, XP per entry, diminishing returns
    xp.test.ts                tests for the math (run `npm test`)
    types.ts                  shapes of log entries, quests, etc.
    quests.ts                 rules for creating quests (shared by preview + server)
    activities.ts             xp.json activities merged with your edits from the app
    diary.ts                  diary entry rules and search
    recap.ts                  weekly recap: the week's numbers, the template recap, the prompt for Claude
  lib/supabase/               database connection, row ↔ app-object mapping
  lib/data.ts                 loads the character sheet from the database (server only)
  lib/sample-data.ts          fake history for the preview
  middleware.ts               keeps your login session fresh
  components/
    ui/                       reusable style pieces: Panel, XpBar, SlashButton
    game/
      CharacterSheet.tsx      the main screen; works in preview, owner and visitor modes
      LiveSheet.tsx           connects CharacterSheet to the database
      PreviewSheet.tsx        connects CharacterSheet to in-memory sample data
      LogDialog.tsx           log with a custom amount, difficulty and note
      QuestEditor.tsx         edit a quest's title, XP and objectives
      NewQuestForm.tsx, StatRadar.tsx, LevelUpOverlay.tsx
  app/
    actions.ts                server actions: the ONLY code that writes to the database
    globals.css               design tokens (colors, fonts) + slashed shapes + animations
    page.tsx, login/, preview/, settings/
    manifest.ts               makes the site installable as a phone app
public/
  sw.js, offline.html         offline screen + caching of app files
  icons/                      app icons (home screen, favicon)
supabase/migrations/
  0001_init.sql               database tables + security rules
  0002_totals_and_rewards.sql fast XP totals + all-or-nothing daily/quest rewards
  0003_streaks.sql            XP per day + planned rest days (for streaks and momentum)
  0004_depth.sql              skill unlocks, loot shop purchases, color theme
  0005_rewards_wallet_calendar.sql  custom quest rewards, wallet, calendar links (all owner-only)
  0006_imports.sql            import inbox + connections, approve_import, ingest_health (Apple Health)
  0007_showcase_privacy.sql   what visitors see: section switches, hidden domains (enforced in the database)
  0008_activities_diary_recaps.sql  your own quick-log activities, diary, weekly recaps
```

### The scoring rules (`src/config/xp.json`)

- **XP for one entry** = `(baseXp + xpPerUnit × units) × difficulty × repeat`
- **units** are capped at `maxUnits`, so one 10-hour entry can't break the game.
- **difficulty** goes from 1 (Trivial, ×0.5) to 5 (Brutal, ×2).
- **repeat**: the 2nd run of the day is worth ×0.7, the 3rd ×0.49, and so on, never below ×0.1.
- **Leveling up** from level *n* costs `base × n^exponent` XP. Each domain levels on its own, and overall level uses total XP.
- **gold** = 10% of XP. You spend it in the loot shop (Phase 4).
- **streak**: days in a row with any XP. Every 7 streak days earns a **shield** (max 3), and a missed day uses one automatically instead of resetting your streak.
- **rest days**: plan 1 per week (Mon–Sun) by tapping today or a future day in the Streak calendar. They keep your streak safe, but can't be added after the fact.
- **momentum** (0–100): +10 per active day, −15% per missed day, unchanged on rest days. Momentum at the start of a day gives that day's activities up to **+20% XP**.
- **skills**: unlocking one pays its XP (plus 10% as gold). A skill needs the one above it unlocked first.
- **loot shop**: your gold balance = gold earned − gold spent. Rewards can be repeatable or one-time.
- **achievements** (`src/lib/game/achievements.ts`) are judged on the server from your database and recorded once earned.
- **themes** (`src/lib/game/themes.ts`) unlock at levels 5, 10, 15 and 20.
- **world map** (`src/lib/game/world.ts`, drawn in `src/components/game/WorldMap.tsx`): each region's stage follows its domain level (1, 3, 5, 10, 15, 25).
- **custom rewards**: any quest or daily can carry your own real-world reward ("Math lecture → buy new clothes"). Finishing it puts the reward in your inventory, for free.
- **quick tasks**: a main or side quest with no objectives becomes a one-step task named after itself.
- **calendar links** are fetched only on the server (`src/app/calendar-actions.ts`, parsed by `src/lib/calendar/ics.ts`), never sent to the browser, and only https / webcal links to public hosts are allowed.
- **seasons** (`src/lib/game/seasons.ts`): named chapters with dates and pinned quests as goals. The rank is based on the share of active days: S ≥ 90%, A ≥ 75%, B ≥ 50%, C ≥ 25%, otherwise D.
- **editable quick log** (`src/lib/game/activities.ts`): Today → Quick log → ✎ Edit. Add your own activities, change name, domain, unit and XP rules, hide or reorder buttons. Built-in ones (from xp.json) can be reset; your own can be deleted, or are hidden instead if they have log entries. Changes only affect new entries.
- **weekly recap** (`src/lib/game/recap.ts`, `src/lib/server/recap-ai.ts`): for each Monday–Sunday week, the XP, active days, domains and level-ups, top activities, quests and bosses, trophies, streak and season progress. Claude turns that into a short recap; without an API key a template writes it instead.
- Streaks are *replayed* from your log every time (`src/lib/game/streaks.ts`), so nothing can drift out of sync, and changing these numbers re-tells your history with the new rules.

### The database (`supabase/migrations/0001_init.sql`)

- `log_entries` is the **single ledger**. Every XP and gold point, whether from a manual log, a finished quest or an import, is one row. Levels and gold balance are computed from it.
- **Security:** exactly one owner (you) can write. Visitors can only read rows marked public, and only while your profile is set to public. The loot shop is always private.

## Design

The style is an original high-contrast JRPG menu look: ink black, paper white and crimson, with sliced corners, slanted bars, halftone dots and stamp-style animations. All colors are tokens at the top of `src/app/globals.css`. Fonts (Anton, Barlow Condensed, Inter) are self-hosted via `@fontsource`.

## Setting up Supabase

1. Create a project at supabase.com.
2. In **SQL Editor**, run each file in `supabase/migrations/` in order: `0001_init.sql`, `0002_totals_and_rewards.sql`, `0003_streaks.sql`, `0004_depth.sql`, `0005_rewards_wallet_calendar.sql`, `0006_imports.sql`, `0007_showcase_privacy.sql`, `0008_activities_diary_recaps.sql`.
3. In **Authentication → Users → Add user**, create your user and tick **Auto Confirm User**.
4. In **Authentication → Sign In / Providers**, turn off **Allow new users to sign up**.
5. Make yourself the owner by running this in the SQL Editor:
   `insert into app_owner (user_id) values ('<your user UID>');`
6. Copy `.env.example` to `.env.local`. Fill in the Project URL and the **publishable** key from **Project Settings → API Keys**. Never use the secret / service_role key.
7. Optional: make your profile visible to visitors:
   `update profile set is_public = true, display_name = 'Your Name', title = 'Your title';`

## Install on your phone

- **iPhone:** open the site in **Safari**, tap **Share → Add to Home Screen**.
- **Android:** open it in **Chrome**, tap **⋮ → Install app** (or "Add to Home screen").

It opens full screen with its own icon. Pages always load fresh from the network. If you're offline, you get an offline screen instead of an error. App files are cached by `public/sw.js`; bump `VERSION` there if you ever change how it caches.

## Public page, privacy and share cards

- **Privacy** (Settings → What visitors see): switch sections on or off (quests, journal, streak, world, skills, trophies, seasons) and hide whole domains. Lock single quests or entries with 🔒. Quests, skills, trophies, seasons, rest days, hidden domains and locked items are blocked by database rules (`0007_showcase_privacy.sql`), not just hidden on the page. The wallet, shop, gold, calendar, inbox and rewards are never visible to visitors.
- **Share cards** (`/api/card?type=profile|level|boss|season`): PNG images drawn on the server from data the current viewer may see. Share buttons appear on the level-up and boss-victory screens, on seasons, in the Journal, and on your showcase. Your site link previews with your profile card (or a neutral "Coming soon" card while private).

## Imports (GitHub, Strava, Apple Health)

Everything lands in the **Inbox** as pending. Nothing counts until you approve it, and the database blocks importing the same thing twice. The rules for turning imports into activities are in `xp.json` → `imports`.

- **GitHub:** enter your username in Inbox → Connections. Commits are grouped per repo per day, each worth `minutesPerCommit` minutes of Code. Private repos are optional: create a fine-grained token (read-only, "Contents" and "Metadata") and add it in Vercel as `GITHUB_TOKEN`.
- **Strava:** create an app at strava.com/settings/api, set its Authorization Callback Domain to your site's domain, add `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` in Vercel, redeploy, then click **Connect Strava** in the Inbox.
- **Apple Health:** Inbox → Apple Health → Set up shows a token (once) and step-by-step Shortcut instructions. The Shortcut POSTs `{ date, steps, workout_minutes, run_minutes, mindful_minutes }` to `/api/import/health` with `Authorization: Bearer <token>`. Only a sha-256 fingerprint of the token is stored.
- Connected sources sync automatically when you open the Inbox, if the last sync was over 30 minutes ago, or whenever you press **Sync now**.

## Weekly recaps written by Claude

Recaps work without any setup: a built-in template writes them from your numbers. For recaps written by Claude:

1. Go to **console.anthropic.com**, sign in, and add a little credit under **Billing** (a recap costs about 3 US cents).
2. Under **API Keys**, click **Create Key**, name it `life-rpg` and copy it. It's shown only once.
3. In Vercel: your project → **Settings → Environment Variables** → add `ANTHROPIC_API_KEY` with the key as its value (all environments) → **Save**.
4. **Deployments** → ⋯ on the latest one → **Redeploy**, so the site picks up the key.

The key stays on the server: it's never sent to the browser, and it isn't in the code. Don't paste it anywhere else. If it ever leaks, delete it in the Anthropic Console and create a new one.

- **What's sent to Claude:** the week's numbers (XP, activities, quests, streak, season) and, if "Use my diary notes" is ticked, that week's diary entries. Nothing else.
- **When:** the first time you open the Journal after a week ends (the Today page shows a banner). You can also write or rewrite any past week from the Journal.
- **Privacy:** recaps are private until you click **Make public**. Read one before you make it public: it can mention hidden domains and your diary.
- The model is `claude-opus-5-5` at low effort (`src/lib/server/recap-ai.ts`). If a safety check ever declines a request, the API retries it on another suitable model automatically (server-side fallback).

## Deploying on Vercel

1. At vercel.com, go to **Add New → Project** and import `life-rpg` from GitHub.
2. Under **Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Click **Deploy**. Every push to `main` redeploys automatically.
