-- Run in Supabase SQL editor

begin;

create table if not exists public.lr_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.lr_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  action text not null check (action in ('like','dislike')),
  updated_at timestamptz default now(),
  primary key (user_id, item_id)
);

alter table public.lr_profiles
  add column if not exists schema_version integer not null default 1;

update public.lr_profiles set updated_at = now() where updated_at is null;
alter table public.lr_profiles alter column updated_at set not null;
update public.lr_feedback set updated_at = now() where updated_at is null;
alter table public.lr_feedback alter column updated_at set not null;

create table if not exists public.lr_watchlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_key text not null,
  title text not null,
  target_price numeric(10,2) not null check (target_price >= 0),
  last_known_price numeric(10,2) check (last_known_price >= 0),
  last_known_store text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, game_key)
);

alter table public.lr_watchlist
  add column if not exists deleted_at timestamptz;

comment on column public.lr_watchlist.deleted_at is
  'Soft-delete version timestamp. Active watchlist queries must filter deleted_at is null.';

create table if not exists public.lr_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  target_price_enabled boolean not null default false,
  free_game_enabled boolean not null default false,
  weekly_digest_enabled boolean not null default false,
  timezone text not null default 'America/New_York',
  digest_day smallint not null default 5 check (digest_day between 0 and 6),
  digest_hour smallint not null default 10 check (digest_hour between 0 and 23),
  unsubscribed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.lr_profiles enable row level security;
alter table public.lr_feedback enable row level security;
alter table public.lr_watchlist enable row level security;
alter table public.lr_notification_preferences enable row level security;

drop policy if exists "lr_profiles owner" on public.lr_profiles;
create policy "lr_profiles owner"
  on public.lr_profiles for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "lr_feedback owner" on public.lr_feedback;
create policy "lr_feedback owner"
  on public.lr_feedback for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "lr_watchlist owner" on public.lr_watchlist;
create policy "lr_watchlist owner"
  on public.lr_watchlist for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "lr_notification_preferences owner"
  on public.lr_notification_preferences;
create policy "lr_notification_preferences owner"
  on public.lr_notification_preferences for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.lr_sync_profile(
  p_expected_user_id uuid,
  p_data jsonb,
  p_schema_version integer,
  p_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_applied boolean;
begin
  if v_user_id is null or v_user_id <> p_expected_user_id then
    raise exception 'Account session changed' using errcode = '42501';
  end if;
  if p_data is null or p_schema_version <> 1 or p_updated_at is null then
    return false;
  end if;

  insert into public.lr_profiles (user_id, data, schema_version, updated_at)
  values (v_user_id, p_data, p_schema_version, p_updated_at)
  on conflict (user_id) do update
    set data = excluded.data,
        schema_version = excluded.schema_version,
        updated_at = excluded.updated_at
    where excluded.updated_at > public.lr_profiles.updated_at
  returning true into v_applied;

  if coalesce(v_applied, false) then return true; end if;
  return exists (
    select 1 from public.lr_profiles
    where user_id = v_user_id
      and updated_at = p_updated_at
      and schema_version = p_schema_version
      and data = p_data
  );
end;
$$;

create or replace function public.lr_sync_feedback(
  p_expected_user_id uuid,
  p_item_id text,
  p_action text,
  p_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_applied boolean;
begin
  if v_user_id is null or v_user_id <> p_expected_user_id then
    raise exception 'Account session changed' using errcode = '42501';
  end if;
  if nullif(trim(p_item_id), '') is null
      or p_action is null
      or p_action not in ('like', 'dislike')
      or p_updated_at is null then
    return false;
  end if;

  insert into public.lr_feedback (user_id, item_id, action, updated_at)
  values (v_user_id, p_item_id, p_action, p_updated_at)
  on conflict (user_id, item_id) do update
    set action = excluded.action,
        updated_at = excluded.updated_at
    where excluded.updated_at > public.lr_feedback.updated_at
  returning true into v_applied;

  if coalesce(v_applied, false) then return true; end if;
  return exists (
    select 1 from public.lr_feedback
    where user_id = v_user_id
      and item_id = p_item_id
      and action = p_action
      and updated_at = p_updated_at
  );
end;
$$;

create or replace function public.lr_sync_watch_item(
  p_expected_user_id uuid,
  p_game_key text,
  p_title text,
  p_target_price numeric,
  p_last_known_price numeric,
  p_last_known_store text,
  p_created_at timestamptz,
  p_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_applied boolean;
begin
  if v_user_id is null or v_user_id <> p_expected_user_id then
    raise exception 'Account session changed' using errcode = '42501';
  end if;
  if nullif(trim(p_game_key), '') is null
      or nullif(trim(p_title), '') is null
      or p_target_price is null
      or p_target_price < 0
      or p_last_known_price < 0
      or p_created_at is null
      or p_updated_at is null then
    return false;
  end if;

  insert into public.lr_watchlist (
    user_id, game_key, title, target_price, last_known_price,
    last_known_store, created_at, updated_at, deleted_at
  )
  values (
    v_user_id, p_game_key, p_title, p_target_price, p_last_known_price,
    p_last_known_store, p_created_at, p_updated_at, null
  )
  on conflict (user_id, game_key) do update
    set title = excluded.title,
        target_price = excluded.target_price,
        last_known_price = excluded.last_known_price,
        last_known_store = excluded.last_known_store,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = null
    where excluded.updated_at > public.lr_watchlist.updated_at
  returning true into v_applied;

  if coalesce(v_applied, false) then return true; end if;
  return exists (
    select 1 from public.lr_watchlist
    where user_id = v_user_id
      and game_key = p_game_key
      and title = p_title
      and target_price = p_target_price
      and last_known_price is not distinct from p_last_known_price
      and last_known_store is not distinct from p_last_known_store
      and created_at = p_created_at
      and updated_at = p_updated_at
      and deleted_at is null
  );
end;
$$;

drop function if exists public.lr_delete_watch_item(uuid, text, timestamptz);

create or replace function public.lr_delete_watch_item(
  p_expected_user_id uuid,
  p_game_key text,
  p_expected_updated_at timestamptz,
  p_deleted_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_applied boolean;
begin
  if v_user_id is null or v_user_id <> p_expected_user_id then
    raise exception 'Account session changed' using errcode = '42501';
  end if;
  if nullif(trim(p_game_key), '') is null
      or p_expected_updated_at is null
      or p_deleted_at is null
      or p_deleted_at <= p_expected_updated_at then
    return false;
  end if;

  update public.lr_watchlist
  set deleted_at = p_deleted_at,
      updated_at = p_deleted_at
  where user_id = v_user_id
    and game_key = p_game_key
    and updated_at = p_expected_updated_at
  returning true into v_applied;

  if coalesce(v_applied, false) then return true; end if;
  return exists (
    select 1 from public.lr_watchlist
    where user_id = v_user_id
      and game_key = p_game_key
      and updated_at = p_deleted_at
      and deleted_at = p_deleted_at
  );
end;
$$;

create or replace function public.lr_keep_newest_account_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at <= old.updated_at then return old; end if;
  return new;
end;
$$;

drop trigger if exists lr_profiles_keep_newest on public.lr_profiles;
create trigger lr_profiles_keep_newest
  before update on public.lr_profiles
  for each row execute function public.lr_keep_newest_account_update();
drop trigger if exists lr_feedback_keep_newest on public.lr_feedback;
create trigger lr_feedback_keep_newest
  before update on public.lr_feedback
  for each row execute function public.lr_keep_newest_account_update();
drop trigger if exists lr_watchlist_keep_newest on public.lr_watchlist;
create trigger lr_watchlist_keep_newest
  before update on public.lr_watchlist
  for each row execute function public.lr_keep_newest_account_update();

revoke all on function public.lr_sync_profile(uuid, jsonb, integer, timestamptz) from public;
grant execute on function public.lr_sync_profile(uuid, jsonb, integer, timestamptz) to authenticated;
revoke all on function public.lr_sync_feedback(uuid, text, text, timestamptz) from public;
grant execute on function public.lr_sync_feedback(uuid, text, text, timestamptz) to authenticated;
revoke all on function public.lr_sync_watch_item(
  uuid, text, text, numeric, numeric, text, timestamptz, timestamptz
) from public;
grant execute on function public.lr_sync_watch_item(
  uuid, text, text, numeric, numeric, text, timestamptz, timestamptz
) to authenticated;
revoke all on function public.lr_delete_watch_item(
  uuid, text, timestamptz, timestamptz
) from public;
grant execute on function public.lr_delete_watch_item(
  uuid, text, timestamptz, timestamptz
) to authenticated;

commit;
