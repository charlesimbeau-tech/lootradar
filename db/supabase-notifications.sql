-- Run in the Supabase SQL editor.
-- Delivery and snapshot writes are server-owned. Supabase's service role bypasses
-- RLS; browser roles receive no insert, update, or delete policy on these tables.

create table if not exists public.lr_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_type text not null check (alert_type in ('target_price','free_game','weekly_digest')),
  game_key text,
  condition_key text not null,
  snapshot_id text not null,
  status text not null check (status in ('pending','sending','delivered','retryable','failed','suppressed')),
  provider_message_id text,
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create unique index if not exists lr_alert_delivery_condition
  on public.lr_alert_deliveries(user_id, condition_key);

create table if not exists public.lr_processed_snapshots (
  snapshot_id text primary key,
  updated_at timestamptz not null,
  processed_at timestamptz,
  qualified_deal_count integer not null check (qualified_deal_count >= 0),
  status text not null check (status in ('processing','processed','rejected','failed')),
  rejection_reason text
);

alter table public.lr_alert_deliveries enable row level security;
alter table public.lr_processed_snapshots enable row level security;

drop policy if exists "lr_alert_deliveries owner read"
  on public.lr_alert_deliveries;

create policy "lr_alert_deliveries owner read"
  on public.lr_alert_deliveries for select to authenticated
  using ((select auth.uid()) = user_id);
