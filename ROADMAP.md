# Roadmap

## Phase 0: Setup ✅
- [x] Next.js + TypeScript + Tailwind project
- [x] Design tokens, fonts, base components (Panel, XpBar, SlashButton)
- [x] README explaining the code layout
- [x] Connect GitHub repo `life-rpg`
- [x] Supabase project created
- [x] Vercel deploy

## Phase 1: Foundation ✅
- [x] Database schema with owner-only writes and public read (`supabase/migrations/0001_init.sql`, tested on Postgres 16)
- [x] `xp.json` scoring config with validation
- [x] XP/level math with tests (`npm test`)
- [x] Owner login

## Phase 2: MVP core loop
- [x] Character sheet, radar chart, quick log, dailies, quests, level-up moment (preview with sample data)
- [x] Save to Supabase instead of sample data (server actions; XP computed on the server)
- [x] Create and abandon quests and dailies
- [x] Read-only visitor view when profile is public; "coming soon" otherwise
- [x] Verify end-to-end against the live Supabase project
- [x] Edit quests and dailies (title, XP, add/remove objectives)
- [x] Custom amount, difficulty and note when logging (⋯ on each quick-log button)
- [x] Undo after logging, and delete entries from the log
- [x] Settings page (name, title, bio, public on/off)
- [x] Installable PWA (home-screen icon, full screen, offline screen)
- [ ] Deploy, then **use it daily for 2 weeks** and adjust

## Phase 3: Anti-quit mechanics
- [x] Streaks with earned shields and planned rest days
- [x] Momentum meter that decays slowly, with an XP bonus of up to +20%
- [x] Streak calendar (2 past weeks, this week, next week) and celebration banners
- [ ] Run `0003_streaks.sql` on the live database
- [x] Diminishing returns on repeats
- [x] Effort weighting (units + difficulty)

## Phase 4: Depth
- [ ] Skill trees (visual node graph)
- [ ] Boss fights: full victory screen (HP bar is in the preview)
- [ ] Achievements, including hidden ones
- [ ] Loot shop
- [ ] Unlocks by level

## Phase 5: World map
- [ ] Map with one region per domain that grows as it levels
- [ ] Seasons / chapters

## Phase 6: Automatic imports
- [ ] GitHub commits → Craft
- [ ] Strava → Body
- [ ] Apple Health via iOS Shortcut
- [ ] Calendar (optional)
- [ ] Import inbox

## Phase 7: Public showcase and journal
- [ ] Public profile page
- [ ] Privacy controls per item / domain
- [ ] Timeline / journal view
- [ ] Share images

## Phase 8: Weekly AI recap
- [ ] End-of-week recap saved to the journal

## Phase 9: Polish
- [ ] Sounds, animations, empty states, light theme
- [ ] Performance + accessibility pass
- [ ] Backup / export
