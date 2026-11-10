-- Life RPG: automatic imports (GitHub, Strava, Apple Health) + approval inbox.
-- Safe to run more than once. Everything here is private to the owner.

-- Things waiting for your approval (or already approved / ignored).
create table if not exists import_items (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('github', 'strava', 'health')),
  external_id text not null,
  -- What it is, before it's turned into an activity: 'commits', a Strava sport, 'steps', 'workout', 'run', 'mindful'
  kind text not null,
  quantity numeric not null check (quantity > 0),
  title text not null,
  occurred_on date not null,
  details jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'ignored')),
  log_entry_id uuid references log_entries (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (source, external_id)
);
create index if not exists import_items_status on import_items (status, occurred_on desc);
alter table import_items enable row level security;
drop policy if exists owner_all on import_items;
create policy owner_all on import_items for all using (is_owner()) with check (is_owner());

-- One row per connected source.
create table if not exists import_connections (
  source text primary key check (source in ('github', 'strava', 'health')),
  settings jsonb not null default '{}',
  -- Strava refresh token (owner-only).
  secret text,
  -- Apple Health: a fingerprint (sha-256) of the import token. The token itself is never stored.
  token_hash text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
alter table import_connections enable row level security;
drop policy if exists owner_all on import_connections;
create policy owner_all on import_connections for all using (is_owner()) with check (is_owner());

-- Approve one item: write the ledger entry and mark the item, in one step.
-- XP is calculated by the app (from xp.json) and passed in.
create or replace function approve_import(
  p_item_id uuid, p_activity_slug text, p_domain text, p_units numeric, p_difficulty smallint, p_xp integer, p_gold integer
)
returns setof log_entries
language plpgsql security invoker set search_path = public as $$
declare
  it import_items%rowtype;
  entry log_entries%rowtype;
begin
  select * into it from import_items where id = p_item_id for update;
  if not found then
    raise exception 'That import no longer exists.';
  end if;
  if it.status <> 'pending' then
    raise exception 'That import was already %.', it.status;
  end if;

  insert into log_entries (activity_slug, domain, units, difficulty, note, xp, gold, source, external_id, occurred_on, occurred_at)
  values (p_activity_slug, p_domain, p_units, p_difficulty, it.title, greatest(p_xp, 0), greatest(p_gold, 0), it.source,
          it.external_id, it.occurred_on, (it.occurred_on + time '12:00') at time zone 'UTC')
  returning * into entry;

  update import_items set status = 'approved', log_entry_id = entry.id, decided_at = now() where id = it.id;
  return next entry;
end;
$$;

-- Apple Health: the iPhone Shortcut sends daily totals here (through the site's /api/import/health).
-- It has no login, so this function checks the import token itself. Runs with the owner's table
-- rights (security definer) but can only ever add/refresh *pending* health items.
create or replace function ingest_health(p_token text, p_items jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  k text;
  d date;
  q numeric;
  n integer := 0;
begin
  if p_token is null or length(p_token) < 32 or not exists (
    select 1 from import_connections
    where source = 'health' and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'Invalid import token.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'Send between 1 and 50 items.';
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    k := item ->> 'kind';
    d := (item ->> 'day')::date;
    q := (item ->> 'quantity')::numeric;
    if k not in ('steps', 'workout', 'run', 'mindful') then
      raise exception 'Unknown kind: %', k;
    end if;
    if d < current_date - 30 or d > current_date + 1 then
      raise exception 'Date out of range: %', d;
    end if;
    if q is null or q <= 0 then
      continue; -- nothing to import (e.g. 0 mindful minutes)
    end if;
    if (k = 'steps' and q > 200000) or (k <> 'steps' and q > 1440) then
      raise exception 'Value too large for %: %', k, q;
    end if;

    insert into import_items (source, external_id, kind, quantity, title, occurred_on)
    values (
      'health', k || ':' || d, k, round(q),
      case k
        when 'steps' then round(q) || ' steps'
        when 'workout' then round(q) || ' min workout'
        when 'run' then round(q) || ' min run'
        else round(q) || ' mindful min'
      end,
      d
    )
    on conflict (source, external_id) do update
      set quantity = excluded.quantity, title = excluded.title
      where import_items.status = 'pending';
    n := n + 1;
  end loop;

  update import_connections set last_synced_at = now() where source = 'health';
  return n;
end;
$$;

notify pgrst, 'reload schema';
