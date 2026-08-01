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
  email_payload jsonb,
  idempotency_key text,
  payload_frozen_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz
);

alter table public.lr_alert_deliveries
  add column if not exists email_payload jsonb,
  add column if not exists idempotency_key text,
  add column if not exists payload_frozen_at timestamptz,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists first_attempt_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists lr_alert_delivery_condition
  on public.lr_alert_deliveries(user_id, condition_key);

create unique index if not exists lr_alert_delivery_idempotency
  on public.lr_alert_deliveries(idempotency_key)
  where idempotency_key is not null;

create index if not exists lr_alert_delivery_due
  on public.lr_alert_deliveries(status, next_attempt_at, created_at);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lr_alert_delivery_payload_frozen'
      and conrelid = 'public.lr_alert_deliveries'::regclass
  ) then
    alter table public.lr_alert_deliveries
      add constraint lr_alert_delivery_payload_frozen check (
        (
          email_payload is null
          and idempotency_key is null
          and payload_frozen_at is null
        )
        or
        (
          jsonb_typeof(email_payload) = 'object'
          and idempotency_key is not null
          and payload_frozen_at is not null
        )
      );
  end if;
end
$$;

create table if not exists public.lr_processed_snapshots (
  snapshot_id text primary key,
  updated_at timestamptz not null,
  processed_at timestamptz,
  qualified_deal_count integer not null check (qualified_deal_count >= 0),
  status text not null check (status in ('processing','processed','rejected','failed')),
  rejection_reason text,
  claim_token uuid,
  lease_expires_at timestamptz
);

alter table public.lr_processed_snapshots
  add column if not exists claim_token uuid,
  add column if not exists lease_expires_at timestamptz;

-- The original implementation used processed_at as a lease without an owner
-- token. Retire any such in-flight row so a tokenized claim can safely resume.
update public.lr_processed_snapshots
set status = 'failed',
    rejection_reason = coalesce(
      rejection_reason,
      'Legacy processing claim retired during lease migration'
    )
where status = 'processing'
  and (claim_token is null or lease_expires_at is null);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lr_processed_snapshot_claim'
      and conrelid = 'public.lr_processed_snapshots'::regclass
  ) then
    alter table public.lr_processed_snapshots
      add constraint lr_processed_snapshot_claim check (
        (
          status = 'processing'
          and claim_token is not null
          and lease_expires_at is not null
        )
        or
        (
          status <> 'processing'
          and claim_token is null
          and lease_expires_at is null
        )
      );
  end if;
end
$$;

alter table public.lr_alert_deliveries enable row level security;
alter table public.lr_processed_snapshots enable row level security;

drop policy if exists "lr_alert_deliveries owner read"
  on public.lr_alert_deliveries;

create policy "lr_alert_deliveries owner read"
  on public.lr_alert_deliveries for select to authenticated
  using ((select auth.uid()) = user_id);
