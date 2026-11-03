create table if not exists claim_followups (
  claim_id uuid primary key references claims(id) on delete cascade,
  status text not null default 'PENDING' check(status in ('PENDING','RUNNING','WAITING','COMPLETED','FAILED')),
  next_run_at timestamptz not null default now()+interval '1 hour',
  lease_id uuid,
  lease_until timestamptz,
  attempts integer not null default 0 check(attempts between 0 and 5),
  checkpoint jsonb not null default '{}'::jsonb check(jsonb_typeof(checkpoint)='object'),
  last_error text,
  updated_at timestamptz not null default now()
);
alter table claim_followups enable row level security;
create index if not exists claim_followups_due_idx on claim_followups(next_run_at)
  where status in ('PENDING','WAITING','RUNNING');
create or replace function public.covra_queue_claim_followup() returns trigger
language plpgsql set search_path=public as $$
begin
  insert into claim_followups(claim_id) values(new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists covra_claim_followup_created on claims;
create trigger covra_claim_followup_created after insert on claims
  for each row execute function public.covra_queue_claim_followup();
insert into claim_followups(claim_id) select id from claims
  where status not in ('CANCELLED','PAID','DENIED','EXPIRED') on conflict do nothing;
-- No client RLS policies. Jobs run only through authenticated server credentials.
