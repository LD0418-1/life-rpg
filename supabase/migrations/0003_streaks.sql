-- Life RPG: streaks, shields, rest days, momentum.
-- Streaks are calculated by the app from these two sources, so nothing here
-- needs a scheduled job. Safe to run more than once.

-- XP per day. Visitors only see days built from public entries.
create or replace view daily_xp with (security_invoker = true) as
select occurred_on as day, sum(xp)::bigint as xp
from log_entries
group by occurred_on;

-- Planned rest days: they keep your streak safe.
create table if not exists rest_days (
  day date primary key,
  created_at timestamptz not null default now()
);

alter table rest_days enable row level security;
drop policy if exists owner_all on rest_days;
drop policy if exists public_read on rest_days;
create policy owner_all on rest_days for all using (is_owner()) with check (is_owner());
create policy public_read on rest_days for select using (profile_is_public());

-- Tell the Supabase API to pick up the new view and table right away.
notify pgrst, 'reload schema';
