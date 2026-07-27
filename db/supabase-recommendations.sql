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

create table if not exists public.lr_watchlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_key text not null,
  title text not null,
  target_price numeric(10,2) not null check (target_price >= 0),
  last_known_price numeric(10,2) check (last_known_price >= 0),
  last_known_store text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_key)
);

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

commit;
