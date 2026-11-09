# Life RPG

My life, played as a game. It's a motivation engine that keeps me on track, and a public showcase of what I've done.

**Status:** Phase 2 in progress. Login, saving, quests and dailies work against Supabase. Without Supabase settings, the home page falls back to an interactive **preview with sample data**, which is also always available at `/preview`. See [ROADMAP.md](ROADMAP.md).

### Pages
- `/` is your character sheet. You get the full controls when logged in as the owner, visitors get a read-only view if your profile is public, and everyone else sees "coming soon".
- `/login` is the owner login.
- `/settings` (owner only) is where you set your name, title, bio, and whether your profile is public.
- `/preview` is always the sample-data preview, which is safe to click around in.

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
  lib/game/
    config.ts                 loads + checks xp.json (typos give a clear error)
    xp.ts                     the game math: levels, XP per entry, diminishing returns
    xp.test.ts                tests for the math (run `npm test`)
    types.ts                  shapes of log entries, quests, etc.
    quests.ts                 rules for creating quests (shared by preview + server)
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
- Streaks are *replayed* from your log every time (`src/lib/game/streaks.ts`), so nothing can drift out of sync, and changing these numbers re-tells your history with the new rules.

### The database (`supabase/migrations/0001_init.sql`)

- `log_entries` is the **single ledger**. Every XP and gold point, whether from a manual log, a finished quest or an import, is one row. Levels and gold balance are computed from it.
- **Security:** exactly one owner (you) can write. Visitors can only read rows marked public, and only while your profile is set to public. The loot shop is always private.

## Design

The style is an original high-contrast JRPG menu look: ink black, paper white and crimson, with sliced corners, slanted bars, halftone dots and stamp-style animations. All colors are tokens at the top of `src/app/globals.css`. Fonts (Anton, Barlow Condensed, Inter) are self-hosted via `@fontsource`.

## Setting up Supabase

1. Create a project at supabase.com.
2. In **SQL Editor**, run each file in `supabase/migrations/` in order: `0001_init.sql`, `0002_totals_and_rewards.sql`, `0003_streaks.sql`.
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

## Deploying on Vercel

1. At vercel.com, go to **Add New → Project** and import `life-rpg` from GitHub.
2. Under **Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Click **Deploy**. Every push to `main` redeploys automatically.
