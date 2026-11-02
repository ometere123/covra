-- Operational state for the hosted demonstration issuer and resumable Base indexer.
alter table policies add column if not exists onchain_state smallint not null default 1
  check (onchain_state between 1 and 4);
alter table policies add column if not exists onchain_state_updated_at timestamptz not null default now();

alter table claims add column if not exists onchain_claim_id text;
alter table claims add column if not exists appeal_evidence_url text;
alter table claims add column if not exists base_denial_tx_hash text;
create unique index if not exists claims_onchain_claim_id_idx
  on claims (onchain_claim_id) where onchain_claim_id is not null;

create table if not exists evidence_issuer_observations (
  observation_id text primary key check (observation_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$'),
  coverage_class smallint not null check (coverage_class between 0 and 4),
  evidence_digest text not null check (evidence_digest ~ '^0x[0-9a-fA-F]{64}$'),
  issuer_wallet text not null check (issuer_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  envelope jsonb not null,
  state text not null default 'ACTIVE' check (state in ('ACTIVE','REVOKED','SUPERSEDED')),
  supersedes_observation_id text references evidence_issuer_observations(observation_id),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists evidence_issuer_digest_idx on evidence_issuer_observations(evidence_digest);
alter table evidence_issuer_observations enable row level security;

create table if not exists indexer_leases (
  stream text primary key,
  lease_id uuid not null,
  lease_until timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table indexer_leases enable row level security;

create table if not exists indexer_runs (
  id uuid primary key default gen_random_uuid(),
  stream text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  success boolean,
  from_block bigint,
  through_block bigint,
  indexed_events integer not null default 0,
  replay_only boolean not null default false,
  error text,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists indexer_runs_stream_started_idx on indexer_runs(stream, started_at desc);
alter table indexer_runs enable row level security;

-- Preserve an existing policy-only cursor when upgrading to the complete lifecycle stream.
insert into indexer_cursors(stream,last_block,last_block_hash)
select 'base-lifecycle',last_block,last_block_hash from indexer_cursors where stream='base-policies'
on conflict(stream) do nothing;
