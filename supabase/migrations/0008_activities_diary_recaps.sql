-- Life RPG: editable quick log, diary, weekly recaps. Safe to run more than once.

-- ---------- Editable quick log ----------
-- One row per activity you changed or added. A row whose slug matches an
-- activity in xp.json overrides it: empty (null) columns keep the xp.json value.
-- A row with a new slug is your own activity, so it must fill every column
-- (the app checks that). Old log entries keep the XP they were given.
create table if not exists activity_settings (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  name text check (char_length(name) between 1 and 40),
  domain text check (char_length(domain) between 1 and 40),
  unit text check (char_length(unit) between 1 and 20),
  base_xp numeric check (base_xp between 0 and 500),
  xp_per_unit numeric check (xp_per_unit between 0 and 100),
  max_units numeric check (max_units > 0 and max_units <= 100000),
  default_units numeric check (default_units > 0 and default_units <= 100000),
  quick boolean,
  hidden boolean not null default false,
  position integer,
  updated_at timestamptz not null default now()
);
alter table activity_settings enable row level security;
drop policy if exists owner_all on activity_settings;
create policy owner_all on activity_settings for all using (is_owner()) with check (is_owner());
-- Visitors need activity names to read your public log.
drop policy if exists public_read on activity_settings;
create policy public_read on activity_settings for select
  using (profile_is_public() and not domain_hidden(domain));

-- ---------- Diary ----------
-- Private by default. A public note shows in the Journal when visitors may see it.
create table if not exists diary_entries (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  title text check (title is null or char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 20000),
  mood smallint check (mood between 1 and 5),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists diary_entries_day_idx on diary_entries (day desc, created_at desc);
alter table diary_entries enable row level security;
drop policy if exists owner_all on diary_entries;
create policy owner_all on diary_entries for all using (is_owner()) with check (is_owner());
drop policy if exists public_read on diary_entries;
create policy public_read on diary_entries for select using (is_public and showcase_allows('journal'));

-- ---------- Weekly recaps ----------
-- One per week (Monday to Sunday), written by AI or by the built-in template.
-- Private by default: read it before you make it public.
create table if not exists weekly_recaps (
  week_start date primary key check (extract(isodow from week_start) = 1),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 6000),
  stats jsonb not null default '{}',
  source text not null default 'ai' check (source in ('ai', 'basic')),
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
alter table weekly_recaps enable row level security;
drop policy if exists owner_all on weekly_recaps;
create policy owner_all on weekly_recaps for all using (is_owner()) with check (is_owner());
drop policy if exists public_read on weekly_recaps;
create policy public_read on weekly_recaps for select using (is_public and showcase_allows('journal'));

notify pgrst, 'reload schema';
