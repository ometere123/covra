-- Preserve the exact on-chain extension observed for a locked claim.
-- The contract remains authoritative; this is only an indexed reconciliation fact.
alter table claims add column if not exists claim_resolution_extended_until bigint;
