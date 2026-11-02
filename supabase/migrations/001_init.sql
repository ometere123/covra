-- COVRA application read model. Financial authority stays on Base and GenLayer.
create extension if not exists pgcrypto;

create table if not exists agent_credentials (
  id uuid primary key default gen_random_uuid(),
  owner_wallet text not null check (owner_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  label text not null check (length(label) between 3 and 120),
  key_hash text not null unique,
  scopes jsonb not null default '["quote:read"]'::jsonb,
  max_daily_requests integer not null default 1000 check (max_daily_requests between 1 and 50000),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists agent_owner_idx on agent_credentials (lower(owner_wallet), created_at desc);

create table if not exists agent_request_counts (
  agent_id uuid not null references agent_credentials(id) on delete cascade,
  request_day date not null,
  request_count integer not null default 0,
  primary key (agent_id, request_day)
);

create table if not exists policies (
  policy_id text primary key check (policy_id ~ '^0x[0-9a-fA-F]{64}$'),
  owner_wallet text not null,
  beneficiary_wallet text not null,
  coverage_class smallint not null check (coverage_class between 0 and 4),
  premium_micro_usdc numeric(38, 0) not null check (premium_micro_usdc >= 0),
  cover_micro_usdc numeric(38, 0) not null check (cover_micro_usdc > 0),
  terms_hash text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  claim_deadline timestamptz not null,
  base_tx_hash text not null,
  base_block bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists policies_owner_idx on policies (lower(owner_wallet), created_at desc);
create index if not exists policies_class_idx on policies (coverage_class, ends_at);

create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  policy_id text not null references policies(policy_id),
  claimant_wallet text not null,
  coverage_class smallint not null check (coverage_class between 0 and 4),
  incident_at timestamptz not null,
  description text not null check (length(description) between 80 and 4000),
  evidence_urls jsonb not null,
  evidence_manifest_hash text,
  requested_micro_usdc numeric(38, 0) not null check (requested_micro_usdc > 0),
  status text not null default 'INTAKE' check (
    status in ('INTAKE','AWAITING_EVIDENCE','SUBMITTED_BRADBURY','ADJUDICATING','DECIDED',
      'APPEAL_OPEN','CERTIFIED','SETTLEMENT_PENDING','PAID','DENIED','EXPIRED')
  ),
  bradbury_case_id text,
  bradbury_tx_hash text,
  base_settlement_tx_hash text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (claimant_wallet, idempotency_key)
);
create index if not exists claims_owner_idx on claims (lower(claimant_wallet), created_at desc);
create index if not exists claims_status_idx on claims (status, created_at);

create table if not exists evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id),
  uploaded_by text not null,
  storage_path text not null unique,
  sha256_hex text not null check (sha256_hex ~ '^[0-9a-f]{64}$'),
  content_type text not null,
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  created_at timestamptz not null default now()
);

create table if not exists audit_events (
  id bigint generated always as identity primary key,
  actor_wallet text,
  action text not null,
  resource_id text not null,
  payload_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists audit_resource_idx on audit_events (resource_id, created_at);

create table if not exists indexer_cursors (
  stream text primary key,
  last_block bigint not null,
  updated_at timestamptz not null default now()
);

-- Private server-only tables: no browser/anon direct access.
alter table agent_credentials enable row level security;
alter table agent_request_counts enable row level security;
alter table policies enable row level security;
alter table claims enable row level security;
alter table evidence enable row level security;
alter table audit_events enable row level security;
alter table indexer_cursors enable row level security;
-- No anon/authenticated policies: all access occurs via authenticated server routes
-- using an isolated Postgres server connection. Never expose DATABASE_URL to browser.
