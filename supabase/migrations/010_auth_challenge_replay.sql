create table if not exists auth_challenges (
  nonce_digest text primary key check (nonce_digest ~ '^[0-9a-f]{64}$'),
  wallet text not null,
  message_digest text not null,
  origin text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists auth_challenge_expiry_idx on auth_challenges(expires_at);
alter table auth_challenges enable row level security;
-- No client policies: only the authenticated server database role accesses it.
