-- Life RPG: initial schema.
--
-- Design notes
-- * log_entries is the single ledger: every bit of XP and gold you earn is a
--   row here (manual logs, finished quests, imports). Levels and gold are
--   computed from it, so nothing can drift out of sync.
-- * XP is stored per entry when it's logged, so rebalancing xp.json changes
--   future entries only. A script can recompute history if you ever want that.
-- * Domains and activities live in src/config/xp.json, so they're plain text here.
-- * Security: exactly one owner can write. Visitors can read only rows marked
--   public, and only while the profile itself is public.

-- ---------- Owner ----------

create table app_owner (
  user_id uuid primary key references auth.users (id) on delete cascade,
  singleton boolean not null default true unique check (singleton)
);

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_owner where user_id = auth.uid());
$$;

-- ---------- Profile (one row) ----------

create table profile (
  id smallint primary key default 1 check (id = 1),
  display_name text not null default 'Player One',
  title text,
  bio text,
  avatar_url text,
  timezone text not null default 'UTC',
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into profile (id) values (1);

create or replace function profile_is_public() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_public from profile where id = 1), false);
$$;

-- ---------- Seasons ----------

create table seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  notes text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

-- ---------- Quests ----------

create table quests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('main', 'side', 'daily')),
  title text not null,
  description text,
  domain text,
  xp_reward integer not null default 0 check (xp_reward >= 0),
  gold_reward integer not null default 0 check (gold_reward >= 0),
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  is_boss boolean not null default false,
  boss_hp integer check (boss_hp is null or boss_hp > 0),
  due_on date,
  completed_at timestamptz,
  season_id uuid references seasons (id) on delete set null,
  position integer not null default 0,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table quest_objectives (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references quests (id) on delete cascade,
  title text not null,
  done_at timestamptz,
  position integer not null default 0
);
create index on quest_objectives (quest_id);

-- Dailies repeat, so each day's check-off is its own row.
create table daily_completions (
  quest_id uuid not null references quests (id) on delete cascade,
  day date not null,
  primary key (quest_id, day)
);

-- ---------- The ledger ----------

create table log_entries (
  id uuid primary key default gen_random_uuid(),
  activity_slug text,
  quest_id uuid references quests (id) on delete set null,
  domain text not null,
  units numeric,
  difficulty smallint check (difficulty between 1 and 5),
  note text,
  xp integer not null check (xp >= 0),
  gold integer not null default 0 check (gold >= 0),
  source text not null default 'manual',
  external_id text,
  occurred_at timestamptz not null default now(),
  occurred_on date not null,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  unique (source, external_id),
  check (activity_slug is not null or quest_id is not null)
);
create index on log_entries (occurred_on desc);
create index on log_entries (activity_slug, occurred_on);

-- ---------- Skill trees ----------

create table skills (
  id uuid primary key default gen_random_uuid(),
  tree text not null,
  name text not null,
  description text,
  requirement text,
  domain text,
  parent_id uuid references skills (id) on delete set null,
  xp_reward integer not null default 0 check (xp_reward >= 0),
  unlocked_at timestamptz,
  pos_x real not null default 0,
  pos_y real not null default 0
);
create index on skills (tree);

-- ---------- Achievements (definitions live in code) ----------

create table achievement_unlocks (
  slug text primary key,
  unlocked_at timestamptz not null default now()
);

-- ---------- Loot shop (always private) ----------

create table loot_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  cost integer not null check (cost > 0),
  repeatable boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table loot_purchases (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references loot_items (id) on delete restrict,
  cost integer not null check (cost > 0),
  purchased_at timestamptz not null default now(),
  redeemed_at timestamptz
);

create view gold_balance with (security_invoker = true) as
select
  coalesce((select sum(gold) from log_entries), 0)
  - coalesce((select sum(cost) from loot_purchases), 0) as balance;

-- ---------- Row level security ----------

alter table app_owner enable row level security;
alter table profile enable row level security;
alter table seasons enable row level security;
alter table quests enable row level security;
alter table quest_objectives enable row level security;
alter table daily_completions enable row level security;
alter table log_entries enable row level security;
alter table skills enable row level security;
alter table achievement_unlocks enable row level security;
alter table loot_items enable row level security;
alter table loot_purchases enable row level security;

-- The owner can do everything (app_owner itself is edited only in the SQL editor).
create policy owner_read on app_owner for select using (is_owner());
create policy owner_all on profile for all using (is_owner()) with check (is_owner());
create policy owner_all on seasons for all using (is_owner()) with check (is_owner());
create policy owner_all on quests for all using (is_owner()) with check (is_owner());
create policy owner_all on quest_objectives for all using (is_owner()) with check (is_owner());
create policy owner_all on daily_completions for all using (is_owner()) with check (is_owner());
create policy owner_all on log_entries for all using (is_owner()) with check (is_owner());
create policy owner_all on skills for all using (is_owner()) with check (is_owner());
create policy owner_all on achievement_unlocks for all using (is_owner()) with check (is_owner());
create policy owner_all on loot_items for all using (is_owner()) with check (is_owner());
create policy owner_all on loot_purchases for all using (is_owner()) with check (is_owner());

-- Visitors: read-only, public rows only, and only while the profile is public.
create policy public_read on profile for select using (is_public);
create policy public_read on seasons for select using (profile_is_public());
create policy public_read on quests for select using (is_public and profile_is_public());
create policy public_read on quest_objectives for select using (
  profile_is_public() and exists (select 1 from quests q where q.id = quest_id and q.is_public)
);
create policy public_read on log_entries for select using (is_public and profile_is_public());
create policy public_read on skills for select using (profile_is_public());
create policy public_read on achievement_unlocks for select using (profile_is_public());
