-- Run in Supabase SQL editor

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

alter table public.lr_profiles enable row level security;
alter table public.lr_feedback enable row level security;

drop policy if exists "lr_profiles owner" on public.lr_profiles;
create policy "lr_profiles owner"
  on public.lr_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "lr_feedback owner" on public.lr_feedback;
create policy "lr_feedback owner"
  on public.lr_feedback for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
