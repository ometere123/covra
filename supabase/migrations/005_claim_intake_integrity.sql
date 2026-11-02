-- An off-chain policy may have only one non-cancelled claim, matching Base's
-- one permanent claim-lock rule. Retain cancelled drafts for auditing.
alter table claims add column if not exists cancelled_at timestamptz;

alter table claims drop constraint if exists claims_status_check;
alter table claims add constraint claims_status_check check (
  status in ('INTAKE','AWAITING_EVIDENCE','SUBMITTED_BRADBURY','ADJUDICATING',
    'DECIDED','APPEAL_OPEN','BRADBURY_FINALIZED','SETTLEMENT_PENDING',
    'PAID','DENIED','EXPIRED','CANCELLED')
);

-- The uniqueness belongs in PostgreSQL, not a SELECT-then-INSERT race.
create unique index if not exists claims_one_active_per_policy_idx
  on claims (lower(policy_id)) where status <> 'CANCELLED';
