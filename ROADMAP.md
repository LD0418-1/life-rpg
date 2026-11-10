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
- [x] ~~Strava~~: removed later in favor of Apple Health only
- [x] Apple Health via iOS Shortcut → Walk / Workout / Run / Meditate (token checked in the database, only its hash stored)
- [x] Import inbox: approve, ignore, restore, approve all; XP uses the normal rules for that day
- [x] Inbox badge in the sidebar / More sheet, banner on Today
- [ ] ~~Calendar imports~~: skipped, the Calendar page already shows events, and counting meetings as XP would inflate stats
- [x] Run `0006_imports.sql` on the live database

## Phase 7: Public showcase and journal ✅
- [x] Public showcase page for visitors (home page when logged out); "View as visitor" preview at /showcase
- [x] Privacy controls: section switches, hidden domains, per-quest / per-entry locks, enforced by database rules
- [x] Journal: timeline by month or season with level-ups, trophies, skills, season milestones, summary
- [x] Share cards (profile, level-up, boss, season) + link-preview image; Share on level-up / victory screens
- [x] Run `0007_showcase_privacy.sql` on the live database

## Phase 8: Weekly AI recap
- [x] Weekly recap written by Claude (`claude-opus-5-5`) from the week's numbers and, optionally, your diary notes
- [x] Built-in template recap when no Anthropic key is set (also used by the preview)
- [x] Written automatically when you open the Journal after a week ends; "ready to write" banner on Today; rewrite any past week
- [x] Saved to the Journal, private by default; make it public and share it (text + link)
- [x] Editable quick log: add your own activities, edit XP rules, hide, reorder, reset to default
- [x] Diary: notes with mood and title, month view, search, private or public; public notes show in the Journal
- [x] Run `0008_activities_diary_recaps.sql` on the live database
- [ ] Add `ANTHROPIC_API_KEY` in Vercel

## Apple Health, fully (requested)
- [x] Strava removed (code, connection, pending items; approved entries stay in the log)
- [x] Every Apple Health metric is saved: ~30 known ones (steps, distance, energy, exercise, heart rate, resting HR, HRV, blood oxygen, VO₂ max, blood pressure, sleep and stages, weight, body fat, mindful, water, caffeine…) plus any other name
- [x] Health page: tiles with trend lines and change vs the stretch before, 7 / 30 / 90-day charts with hover and low–high band, table view
- [x] Sleep earns XP (Sleep activity, via the Inbox)
- [x] Shortcut guide with every metric name, always available in the Inbox
- [x] Run `0009_health_metrics.sql` on the live database
- [ ] Update the iPhone Shortcut to send the extra metrics

## Phase 9: Polish
- [x] Sound effects made in the browser (XP, quest, level-up, boss victory, trophy, error), on/off per device
- [x] Animations: page slide-in, error shake; "reduce motion" on your device turns all motion off
- [x] Empty states with a hint about what to do next
- [x] Light theme (Dark / Light / follow device), chosen per device, no dark flash on load
- [x] Accessibility pass: 0 issues from the axe checker on all 12 pages, dark and light (text contrast, chart labels, landmarks)
- [x] Performance: page data loads in parallel; small pages (≈100–135 kB of JavaScript)
- [x] Backup: full JSON backup, log as CSV, diary as text (Settings → Backup); secrets left out
