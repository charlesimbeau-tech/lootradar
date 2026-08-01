-- Freeze an alert payload only for the worker that owns the active sending lease.
-- The typed RPC avoids PostgREST filter ambiguity across UUID and JSONB fields.

begin;

create or replace function public.lr_freeze_alert_delivery(
  p_id uuid,
  p_lease_token uuid,
  p_email_payload jsonb,
  p_idempotency_key text,
  p_frozen_at timestamptz
)
returns setof public.lr_alert_deliveries
language sql
security invoker
set search_path = public
as $function$
  update public.lr_alert_deliveries
  set email_payload = p_email_payload,
      idempotency_key = p_idempotency_key,
      payload_frozen_at = p_frozen_at,
      updated_at = p_frozen_at
  where id = p_id
    and status = 'sending'
    and lease_token = p_lease_token
  returning *;
$function$;

revoke all on function public.lr_freeze_alert_delivery(uuid, uuid, jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.lr_freeze_alert_delivery(uuid, uuid, jsonb, text, timestamptz)
  to service_role;

commit;
