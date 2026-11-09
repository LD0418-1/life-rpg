-- Life RPG: fast totals + all-or-nothing quest rewards.

-- XP and gold per domain. Visitors only see totals of public entries
-- (security_invoker makes the view obey row level security).
create view domain_totals with (security_invoker = true) as
select domain, sum(xp)::bigint as xp, sum(gold)::bigint as gold
from log_entries
group by domain;

-- Check off a daily for `p_day` and pay its reward, in one step.
-- Returns the new ledger row, or nothing if it was already done that day.
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

  return query
  insert into log_entries (quest_id, domain, xp, gold, source, occurred_on, note, is_public)
  values (q.id, coalesce(q.domain, 'spirit'), q.xp_reward, q.gold_reward, 'quest', p_day, q.title, q.is_public)
  returning *;
end;
$$;

-- Tick or untick a quest objective. When the last one is ticked, the quest is
-- completed and its reward paid, in the same step. Returns the reward row, if any.
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

  return query
  insert into log_entries (quest_id, domain, xp, gold, source, occurred_on, note, is_public)
  values (q.id, coalesce(q.domain, 'spirit'), q.xp_reward, q.gold_reward, 'quest', p_day, q.title, q.is_public)
  returning *;
end;
$$;
