-- A finalized GenLayer decision is not a Base settlement certificate.
-- Reclassify any earlier rows before enforcing the more precise state enum.
update claims set status='BRADBURY_FINALIZED', updated_at=now()
where status='CERTIFIED';

alter table claims drop constraint if exists claims_status_check;
alter table claims add constraint claims_status_check check (
  status in ('INTAKE','AWAITING_EVIDENCE','SUBMITTED_BRADBURY','ADJUDICATING',
    'DECIDED','APPEAL_OPEN','BRADBURY_FINALIZED','SETTLEMENT_PENDING',
    'PAID','DENIED','EXPIRED')
);
