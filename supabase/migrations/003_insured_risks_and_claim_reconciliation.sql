-- Each signed policy freezes one insured risk, independently of its broad class.
alter table policies add column if not exists risk_spec_hash text;
alter table claims add column if not exists base_lock_tx_hash text;
alter table claims add column if not exists bradbury_decision_tx_hash text;
alter table claims add column if not exists bradbury_finalization_tx_hash text;
alter table claims add column if not exists evidence_revision smallint not null default 0;

create table if not exists policy_risk_specs (
  policy_id text primary key check (policy_id ~ '^0x[0-9a-fA-F]{64}$'),
  owner_wallet text not null check (owner_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  risk_spec_hash text not null check (risk_spec_hash ~ '^0x[0-9a-fA-F]{64}$'),
  risk_spec_json jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists policy_risk_specs_owner_idx on policy_risk_specs (lower(owner_wallet));
alter table policy_risk_specs enable row level security;

-- Chain receipts remain indexed read-only facts, never independent payout authority.
create table if not exists claim_chain_events (
  chain_id integer not null,
  tx_hash text not null,
  log_index integer not null,
  claim_id uuid references claims(id),
  event_type text not null,
  block_number bigint,
  block_hash text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (chain_id,tx_hash,log_index)
);
alter table claim_chain_events enable row level security;
