-- Life RPG: all of Apple Health, and Strava removed. Safe to run more than once.

-- ---------- Daily health metrics ----------
-- One row per metric per day (steps, sleep, heart rate, weight, ...). Private:
-- visitors can never read it.
create table if not exists health_metrics (
  day date not null,
  metric text not null check (metric ~ '^[a-z][a-z0-9_]{0,39}$'),
  value numeric not null check (value >= 0 and value < 10000000),
  min_value numeric,
  max_value numeric,
  samples integer not null default 1 check (samples between 1 and 5000),
  updated_at timestamptz not null default now(),
  primary key (day, metric)
);
create index if not exists health_metrics_metric_day_idx on health_metrics (metric, day);
alter table health_metrics enable row level security;
drop policy if exists owner_all on health_metrics;
create policy owner_all on health_metrics for all using (is_owner()) with check (is_owner());

-- ---------- What the iPhone Shortcut sends ----------
-- Checks the import token like ingest_health (0006), then saves every metric and
-- puts the XP-worthy ones (steps, workouts, runs, mindful minutes, sleep) in the inbox.
create or replace function ingest_health_data(p_token text, p_items jsonb, p_metrics jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  k text;
  d date;
  q numeric;
  n_items integer := 0;
  n_metrics integer := 0;
begin
  if p_token is null or length(p_token) < 32 or not exists (
    select 1 from import_connections
    where source = 'health' and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'Invalid import token.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then
    raise exception 'Send at most 200 items.';
  end if;
  if jsonb_typeof(p_metrics) <> 'array' or jsonb_array_length(p_metrics) > 2000 then
    raise exception 'Send at most 2000 metrics.';
  end if;

  -- Metrics: saved as they are (a later send for the same day replaces the value).
  for item in select * from jsonb_array_elements(p_metrics) loop
    d := (item ->> 'day')::date;
    if d < current_date - 400 or d > current_date + 1 then
      raise exception 'Date out of range: %', d;
    end if;
    insert into health_metrics (day, metric, value, min_value, max_value, samples, updated_at)
    values (d, item ->> 'metric', (item ->> 'value')::numeric, (item ->> 'min')::numeric, (item ->> 'max')::numeric,
            coalesce((item ->> 'samples')::integer, 1), now())
    on conflict (day, metric) do update
      set value = excluded.value, min_value = excluded.min_value, max_value = excluded.max_value,
          samples = excluded.samples, updated_at = now();
    n_metrics := n_metrics + 1;
  end loop;

  -- Inbox items (XP once you approve them). Only the last 30 days.
  for item in select * from jsonb_array_elements(p_items) loop
    k := item ->> 'kind';
    d := (item ->> 'day')::date;
    q := (item ->> 'quantity')::numeric;
    if k not in ('steps', 'workout', 'run', 'mindful', 'sleep') then
      raise exception 'Unknown kind: %', k;
    end if;
    if d < current_date - 30 or d > current_date + 1 or q is null or q <= 0 then
      continue;
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
        when 'sleep' then round(q / 60.0, 1) || ' h sleep'
        else round(q) || ' mindful min'
      end,
      d
    )
    on conflict (source, external_id) do update
      set quantity = excluded.quantity, title = excluded.title
      where import_items.status = 'pending';
    n_items := n_items + 1;
  end loop;

  update import_connections set last_synced_at = now() where source = 'health';
  return jsonb_build_object('metrics', n_metrics, 'items', n_items);
end;
$$;
-- Anyone may call it (the Shortcut isn't logged in); the token check above is the lock.
grant execute on function ingest_health_data(text, jsonb, jsonb) to anon, authenticated;

-- ---------- Strava is gone ----------
-- Forget the saved Strava login and drop Strava items still waiting in the inbox.
-- Strava entries you already approved stay in your log.
delete from import_connections where source = 'strava';
delete from import_items where source = 'strava' and status = 'pending';

notify pgrst, 'reload schema';
