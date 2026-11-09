# Life RPG

My life, played as a game. It's a motivation engine that keeps me on track, and a public showcase of what I've done.

**Status:** Phase 0 and Phase 1 are done. The home page is an interactive **preview with sample data**: tap the quick-log buttons, check off dailies, level up. Nothing is saved until Supabase is connected (Phase 2). See [ROADMAP.md](ROADMAP.md).

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
  lib/sample-data.ts          fake history for the preview
  components/
    ui/                       reusable style pieces: Panel, XpBar, SlashButton
    game/                     game screens: CharacterSheetPreview, StatRadar, LevelUpOverlay
  app/
    globals.css               design tokens (colors, fonts) + slashed shapes + animations
    page.tsx                  home page
supabase/migrations/
  0001_init.sql               database tables + security rules
```

### The scoring rules (`src/config/xp.json`)

- **XP for one entry** = `(baseXp + xpPerUnit × units) × difficulty × repeat`
- **units** are capped at `maxUnits`, so one 10-hour entry can't break the game.
- **difficulty** goes from 1 (Trivial, ×0.5) to 5 (Brutal, ×2).
- **repeat**: the 2nd run of the day is worth ×0.7, the 3rd ×0.49, and so on, never below ×0.1.
- **Leveling up** from level *n* costs `base × n^exponent` XP. Each domain levels on its own, and overall level uses total XP.
- **gold** = 10% of XP. You spend it in the loot shop (Phase 4).

### The database (`supabase/migrations/0001_init.sql`)

- `log_entries` is the **single ledger**. Every XP and gold point, whether from a manual log, a finished quest or an import, is one row. Levels and gold balance are computed from it.
- **Security:** exactly one owner (you) can write. Visitors can only read rows marked public, and only while your profile is set to public. The loot shop is always private.

## Design

The style is an original high-contrast JRPG menu look: ink black, paper white and crimson, with sliced corners, slanted bars, halftone dots and stamp-style animations. All colors are tokens at the top of `src/app/globals.css`. Fonts (Anton, Barlow Condensed, Inter) are self-hosted via `@fontsource`.

## Setting up Supabase (Phase 2)

1. Create a project at supabase.com.
2. In **SQL Editor**, run `supabase/migrations/0001_init.sql`.
3. In **Authentication → Users**, create your user. Then, in **Authentication → Providers**, turn off new sign-ups.
4. Make yourself the owner by running this in the SQL Editor:
   `insert into app_owner (user_id) values ('<your user id>');`
5. Copy the project URL and anon key into `.env.local` (details come with Phase 2).
