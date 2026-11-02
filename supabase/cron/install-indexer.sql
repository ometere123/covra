-- COVRA hosted indexer schedule. Run only after the Vercel route is deployed.
-- Prerequisites, entered outside the repository:
--   Vault secret covra_indexer_url: https://<deployed-host>/api/indexer/sync
--   Vault secret covra_indexer_cron_secret: the same INDEXER_CRON_SECRET as Vercel
-- This file contains neither secret value nor deployment hostname.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'covra_indexer_url') then
    raise exception 'Missing Vault secret covra_indexer_url';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'covra_indexer_cron_secret') then
    raise exception 'Missing Vault secret covra_indexer_cron_secret';
  end if;
end $$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'covra-indexer-five-minute';

select cron.schedule(
  'covra-indexer-five-minute',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'covra_indexer_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'covra_indexer_cron_secret')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Verification queries (run after installation):
-- select jobid, jobname, schedule, active, command from cron.job where jobname = 'covra-indexer-five-minute';
-- select jobid, status, return_message, start_time, end_time
-- from cron.job_run_details where jobid = <jobid> order by start_time desc limit 10;
