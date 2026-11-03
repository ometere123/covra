-- Names, timings and public execution results only. Never select Vault values or request headers.
select jsonb_build_object(
  'jobs', (select jsonb_agg(jsonb_build_object('jobid',jobid,'name',jobname,'schedule',schedule,'active',active))
    from cron.job where jobname='covra-indexer-five-minute'),
  'history', (select jsonb_agg(to_jsonb(r)) from
    (select jobid,status,start_time,end_time from cron.job_run_details
      where jobid in (select jobid from cron.job where jobname='covra-indexer-five-minute')
      order by start_time desc limit 5) r),
  'http', (select jsonb_agg(to_jsonb(r)) from
    (select id,status_code,timed_out,created from net._http_response order by id desc limit 5) r),
  'cursors', (select jsonb_agg(to_jsonb(r)) from
    (select stream,last_block,last_block_hash,updated_at from indexer_cursors order by updated_at desc limit 3) r)
) as verification;
