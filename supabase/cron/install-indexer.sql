-- COVRA hosted indexer schedule. Run only after the Vercel route is deployed.
-- Prerequisites, entered outside the repository:
--   Vault secret covra_indexer_url: https://<deployed-host>/api/indexer/sync
--   Vault secret covra_indexer_cron_secret: the same INDEXER_CRON_SECRET as Vercel
-- This file contains neither secret value nor deployment hostname.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $install$
declare
  existing_job bigint;
  job_command constant text := $request$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'covra_indexer_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'covra_indexer_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $request$;
begin
  if (select count(*) from vault.secrets where name = 'covra_indexer_url') <> 1 then
    raise exception 'Expected one Vault secret named covra_indexer_url';
  end if;
  if (select count(*) from vault.secrets where name = 'covra_indexer_cron_secret') <> 1 then
    raise exception 'Expected one Vault secret named covra_indexer_cron_secret';
  end if;
  if (select count(*) from cron.job where jobname = 'covra-indexer-five-minute') > 1 then
    raise exception 'Multiple COVRA indexer jobs require operator review';
  end if;
  select jobid into existing_job from cron.job where jobname = 'covra-indexer-five-minute';
  if existing_job is null then
    perform cron.schedule('covra-indexer-five-minute', '*/5 * * * *', job_command);
  else
    -- Preserve the job identity, history, owning role and active flag.
    perform cron.alter_job(existing_job, schedule := '*/5 * * * *', command := job_command);
  end if;
end;
$install$;

-- Verification queries (run after installation):
-- select jobid, jobname, schedule, active from cron.job where jobname = 'covra-indexer-five-minute';
-- select jobid, status, return_message, start_time, end_time
-- from cron.job_run_details where jobid = <jobid> order by start_time desc limit 10;
