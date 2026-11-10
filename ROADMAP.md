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
- [x] Run `0003_streaks.sql` on the live database
- [x] Diminishing returns on repeats
- [x] Effort weighting (units + difficulty)

## Phase 4: Depth
- [x] Sidebar (desktop) and tab bar (phone) with separate pages: Today, Quests, Skills, Trophies, Shop
- [x] Skill trees (visual node graph, milestones, unlock pays XP + gold)
- [x] Boss fights: full victory screen
- [x] Achievements (21, including 3 hidden), checked on the server
- [x] Loot shop with inventory ("use it") and gold balance
- [x] Unlocks by level: color themes at levels 5, 10, 15, 20
- [x] Run `0004_depth.sql` on the live database

## Phase 5: World map ✅
- [x] World map: an original illustrated island with one region per domain, 6 building stages each, drawn in SVG
- [x] "World upgraded" banner when a region reaches a new stage
- [x] Seasons: name, dates, notes, pinned quests as goals, day X of Y, live stats and rank
- [x] Past season recaps (XP, active days, best streak, goals, levels gained, rank S–D)
- [x] No database changes needed (seasons and quest links were already in 0001)

## Extras (requested)
- [x] Custom real-world rewards on quests and dailies, delivered to the inventory on completion
- [x] One-step tasks (quests without objectives)
- [x] Wallet: income/expenses, categories, monthly budget, category and daily charts
- [x] "Use it" on an inventory item can log what it cost to the wallet
- [x] Calendar: Google / Apple calendars via private iCal links, month + agenda views, Life RPG day markers
- [x] Navigation: 8 sections in the sidebar; phones get Today / Quests / Calendar / Wallet + a "More" sheet
- [x] Run `0005_rewards_wallet_calendar.sql` on the live database

## Phase 6: Automatic imports ✅
- [x] GitHub commits → Code (grouped per repo per day; follow-up items for commits after approval)
- [x] Strava → Run / Workout (OAuth connect, refresh tokens, moving time)
- [x] Apple Health via iOS Shortcut → Walk / Workout / Run / Meditate (token checked in the database, only its hash stored)
- [x] Import inbox: approve, ignore, restore, approve all; XP uses the normal rules for that day
- [x] Inbox badge in the sidebar / More sheet, banner on Today
- [ ] ~~Calendar imports~~: skipped, the Calendar page already shows events, and counting meetings as XP would inflate stats
- [x] Run `0006_imports.sql` on the live database

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
