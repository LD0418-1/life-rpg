-- Life RPG: showcase privacy controls. Safe to run more than once.
--
-- profile.visibility says which sections visitors may see and which domains are
-- hidden from them, e.g.
--   {"quests": true, "journal": true, "streak": true, "world": true, "skills": true,
--    "trophies": true, "seasons": true, "hiddenDomains": ["social"]}
-- The rules below enforce it in the database, so hidden things can't be read
-- through the API either. (Your private wallet, shop, calendar and imports were
-- never visible to visitors at all.)

alter table profile add column if not exists visibility jsonb not null default '{}';

-- May visitors see this section? (Also false whenever the profile itself is private.)
create or replace function showcase_allows(p_section text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_public and coalesce((visibility ->> p_section)::boolean, true) from profile where id = 1), false);
$$;

-- Is this domain hidden from visitors?
create or replace function domain_hidden(p_domain text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select visibility -> 'hiddenDomains' ? coalesce(p_domain, '') from profile where id = 1), false);
$$;

-- Log entries: public ones, while the profile is public, unless their domain is hidden.
drop policy if exists public_read on log_entries;
create policy public_read on log_entries for select
  using (is_public and profile_is_public() and not domain_hidden(domain));

drop policy if exists public_read on quests;
create policy public_read on quests for select
  using (is_public and showcase_allows('quests') and not domain_hidden(domain));

drop policy if exists public_read on quest_objectives;
create policy public_read on quest_objectives for select
  using (exists (
    select 1 from quests q
    where q.id = quest_id and q.is_public and showcase_allows('quests') and not domain_hidden(q.domain)
  ));

drop policy if exists public_read on skills;
create policy public_read on skills for select
  using (showcase_allows('skills') and not domain_hidden(domain));

drop policy if exists public_read on achievement_unlocks;
create policy public_read on achievement_unlocks for select using (showcase_allows('trophies'));

drop policy if exists public_read on seasons;
create policy public_read on seasons for select using (showcase_allows('seasons'));

drop policy if exists public_read on rest_days;
create policy public_read on rest_days for select using (showcase_allows('streak'));

notify pgrst, 'reload schema';
