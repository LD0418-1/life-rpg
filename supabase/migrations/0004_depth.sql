-- Life RPG: skill trees, loot shop, level unlocks. Safe to run more than once.

-- Skill unlocks pay XP like quests do, so ledger rows can point at a skill.
alter table log_entries add column if not exists skill_id uuid references skills (id) on delete set null;
-- Manual entries need an activity; rewards (quest, skill, ...) are identified by their source.
alter table log_entries drop constraint if exists log_entries_check;
alter table log_entries drop constraint if exists log_entries_reward_check;
alter table log_entries add constraint log_entries_reward_check check (activity_slug is not null or source <> 'manual');

-- The accent color theme you picked (unlocked by level).
alter table profile add column if not exists theme text not null default 'crimson';

-- Unlock a skill and pay its reward in one step. Its parent must be unlocked first.
create or replace function unlock_skill(p_skill_id uuid, p_gold integer, p_day date)
returns setof log_entries
language plpgsql security invoker set search_path = public as $$
declare
  s skills%rowtype;
  parent skills%rowtype;
begin
  select * into s from skills where id = p_skill_id;
  if not found then
    raise exception 'That skill no longer exists.';
  end if;
  if s.unlocked_at is not null then
    raise exception '"%" is already unlocked.', s.name;
  end if;
  if s.parent_id is not null then
    select * into parent from skills where id = s.parent_id;
    if found and parent.unlocked_at is null then
      raise exception 'Unlock "%" first.', parent.name;
    end if;
  end if;

  update skills set unlocked_at = now() where id = s.id;

  return query
  insert into log_entries (skill_id, domain, xp, gold, source, occurred_on, note)
  values (s.id, coalesce(s.domain, 'craft'), s.xp_reward, greatest(p_gold, 0), 'skill', p_day, s.name)
  returning *;
end;
$$;

-- Buy a shop reward if you can afford it.
create or replace function buy_loot(p_item_id uuid)
returns setof loot_purchases
language plpgsql security invoker set search_path = public as $$
declare
  i loot_items%rowtype;
  balance bigint;
begin
  select * into i from loot_items where id = p_item_id and not archived;
  if not found then
    raise exception 'That reward isn''t in the shop anymore.';
  end if;
  if not i.repeatable and exists (select 1 from loot_purchases where item_id = i.id) then
    raise exception '"%" can only be bought once.', i.name;
  end if;
  select g.balance into balance from gold_balance g;
  if balance < i.cost then
    raise exception 'Not enough gold: you have %, "%" costs %.', balance, i.name, i.cost;
  end if;

  return query
  insert into loot_purchases (item_id, cost) values (i.id, i.cost)
  returning *;
end;
$$;

notify pgrst, 'reload schema';
