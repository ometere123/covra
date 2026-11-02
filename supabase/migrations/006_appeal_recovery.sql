-- A Bradbury appeal can finalize before its separate Base evidence update.
-- Preserve the verified pending digest and transaction for safe resumption.
alter table claims add column if not exists pending_appeal_digest text;
alter table claims add column if not exists bradbury_appeal_tx_hash text;

alter table claims drop constraint if exists claims_status_check;
alter table claims add constraint claims_status_check check (
  status in ('INTAKE','AWAITING_EVIDENCE','SUBMITTED_BRADBURY','ADJUDICATING',
    'DECIDED','APPEAL_OPEN','APPEAL_SYNC_PENDING','BRADBURY_FINALIZED',
    'SETTLEMENT_PENDING','PAID','DENIED','EXPIRED','CANCELLED')
);
