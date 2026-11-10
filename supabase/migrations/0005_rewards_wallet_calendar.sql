-- Life RPG: custom quest rewards, wallet (finances), calendar links.
-- Safe to run more than once. Everything here is private to the owner.

-- ---------- Custom rewards on quests ----------
-- Kept in their own table so visitors (who can see public quests) never see them.
create table if not exists quest_rewards (
  quest_id uuid primary key references quests (id) on delete cascade,
  reward text not null check (char_length(reward) between 1 and 120)
);
alter table quest_rewards enable row level security;
drop policy if exists owner_all on quest_rewards;
create policy owner_all on quest_rewards for all using (is_owner()) with check (is_owner());

-- The inventory (loot_purchases) can now also hold free rewards earned from quests.
alter table loot_purchases alter column item_id drop not null;
alter table loot_purchases add column if not exists name text;
alter table loot_purchases add column if not exists quest_id uuid references quests (id) on delete set null;
alter table loot_purchases add column if not exists source text not null default 'shop';
alter table loot_purchases drop constraint if exists loot_purchases_cost_check;
alter table loot_purchases drop constraint if exists loot_purchases_cost_nonneg;
alter table loot_purchases add constraint loot_purchases_cost_nonneg check (cost >= 0);
alter table loot_purchases drop constraint if exists loot_purchases_has_item;
alter table loot_purchases add constraint loot_purchases_has_item check (item_id is not null or name is not null);

-- Completing a daily or quest now also grants its custom reward (if it has one).
create or replace function complete_daily(p_quest_id uuid, p_day date)
returns setof log_entries
language plpgsql security invoker set search_path = public as $$
declare
  q quests%rowtype;
begin
  select * into q from quests where id = p_quest_id and kind = 'daily' and status = 'active';
  if not found then
    raise exception 'daily quest % not found', p_quest_id;
  end if;

  insert into daily_completions (quest_id, day) values (p_quest_id, p_day)
  on conflict do nothing;
  if not found then
    return; -- already done today
  end if;

  insert into loot_purchases (name, cost, quest_id, source)
  select r.reward, 0, q.id, 'quest' from quest_rewards r where r.quest_id = q.id;

  return query
  insert into log_entries (quest_id, domain, xp, gold, source, occurred_on, note, is_public)
  values (q.id, coalesce(q.domain, 'spirit'), q.xp_reward, q.gold_reward, 'quest', p_day, q.title, q.is_public)
  returning *;
end;
$$;

create or replace function set_objective(p_objective_id uuid, p_done boolean, p_day date)
returns setof log_entries
language plpgsql security invoker set search_path = public as $$
declare
  q quests%rowtype;
  remaining integer;
begin
  select qs.* into q
  from quests qs join quest_objectives o on o.quest_id = qs.id
  where o.id = p_objective_id;
  if not found then
    raise exception 'objective % not found', p_objective_id;
  end if;
  if q.status <> 'active' then
    raise exception 'quest "%" is already %', q.title, q.status;
  end if;

  update quest_objectives
  set done_at = case when p_done then coalesce(done_at, now()) else null end
  where id = p_objective_id;

  select count(*) into remaining from quest_objectives where quest_id = q.id and done_at is null;
  if remaining > 0 then
    return;
  end if;

  update quests set status = 'completed', completed_at = now() where id = q.id;

  insert into loot_purchases (name, cost, quest_id, source)
  select r.reward, 0, q.id, 'quest' from quest_rewards r where r.quest_id = q.id;

  return query
  insert into log_entries (quest_id, domain, xp, gold, source, occurred_on, note, is_public)
  values (q.id, coalesce(q.domain, 'spirit'), q.xp_reward, q.gold_reward, 'quest', p_day, q.title, q.is_public)
  returning *;
end;
$$;

-- ---------- Wallet ----------
create table if not exists money_tx (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null,
  kind text not null check (kind in ('expense', 'income')),
  amount numeric(12, 2) not null check (amount > 0),
  category text not null check (char_length(category) between 1 and 40),
  note text check (note is null or char_length(note) <= 200),
  purchase_id uuid references loot_purchases (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists money_tx_day on money_tx (occurred_on desc);
alter table money_tx enable row level security;
drop policy if exists owner_all on money_tx;
create policy owner_all on money_tx for all using (is_owner()) with check (is_owner());

-- One row of wallet settings (kept out of the public profile).
create table if not exists finance_settings (
  id smallint primary key default 1 check (id = 1),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  monthly_budget numeric(12, 2) check (monthly_budget is null or monthly_budget > 0)
);
insert into finance_settings (id) values (1) on conflict do nothing;
alter table finance_settings enable row level security;
drop policy if exists owner_all on finance_settings;
create policy owner_all on finance_settings for all using (is_owner()) with check (is_owner());

-- ---------- Calendar links ----------
-- Private iCal links (Google "secret address", Apple "public calendar" link).
create table if not exists calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  url text not null check (url ~ '^https://'),
  color text not null default 'crimson',
  created_at timestamptz not null default now()
);
alter table calendar_feeds enable row level security;
drop policy if exists owner_all on calendar_feeds;
create policy owner_all on calendar_feeds for all using (is_owner()) with check (is_owner());

notify pgrst, 'reload schema';
