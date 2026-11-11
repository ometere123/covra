-- Keep a canonical Base block timestamp for indexed lifecycle events.
-- Existing rows remain valid and fall back to created_at until replayed.
alter table claim_chain_events add column if not exists block_timestamp timestamptz;
create index if not exists claim_chain_events_capital_wallet_idx
  on claim_chain_events ((lower(payload->>'underwriter')), block_number desc)
  where event_type in ('CapitalDeposited','CapitalWithdrawn');
