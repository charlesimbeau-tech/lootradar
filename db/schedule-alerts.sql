-- Run after storing lootradar_project_url and lootradar_cron_secret in Vault.
-- The processor uses a three-hour local scheduling window, keyed by ISO week,
-- so this UTC cadence catches Friday 10:00 in both standard and daylight time.

select cron.unschedule('lootradar-process-alerts')
where exists (
  select 1
  from cron.job
  where jobname = 'lootradar-process-alerts'
);

select cron.schedule(
  'lootradar-process-alerts',
  '47 */3 * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'lootradar_project_url'
    ) || '/functions/v1/process-alerts',
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'x-lootradar-cron-secret',
      (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'lootradar_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
