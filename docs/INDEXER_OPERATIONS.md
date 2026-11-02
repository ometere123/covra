# Base Sepolia lifecycle indexer

The indexer is a resumable operational read model. Base Sepolia receipts and state remain the settlement source of truth; Supabase never authorizes a payout by itself.

## API

- `POST /api/indexer/sync` with `Authorization: Bearer INDEXER_CRON_SECRET`.
- `GET /api/indexer/reconciliation` with the same operator credential.

Each sync waits for 12 Base Sepolia confirmations, reads up to 2,000 blocks, and indexes the complete relevant `CovraPools` event set. It uses `indexer_cursors` for the canonical cursor and block hash, `indexer_leases` to prevent overlapping runs, and `indexer_runs` for execution history. Event records use the `(chain_id, tx_hash, log_index)` primary key for idempotency.

The lifecycle stream covers every emitted `CovraPools` event: capital deposits, withdrawals and recapitalization; purchase and expiry; claim locking, evidence revision and resolution extension; denial and settlement; agent and claim-agent authorization; pause, quote-signer, attestor-roster and ownership changes. The shared ABI is regression-tested against the Solidity event list. Policy state and claim terminal status are updated only as a consequence of a decoded on-chain event. Existing terminal states are not silently rolled backward by replay. A claim-resolution extension is stored as an indexed deadline and checked against the live contract during reconciliation.

If the cursor block hash no longer matches the canonical Base chain, the route fails closed with `409` before accepting a replay. An operator must inspect the reconciliation report, establish a validated canonical restart point, and perform the required audited cursor/read-model repair before resuming bounded replay. The current API deliberately does not silently rewrite a reorged cursor or roll back derived terminal rows. A bounded replay body such as `{"fromBlock":"<validated block>","maxBlocks":2000}` is supported once that operator-approved recovery is complete; replay runs do not advance the cursor. A normal RPC outage needs no manual cursor change: the next run resumes from the durable cursor.

## Supabase Cron

Vercel Hobby Cron is not used: its schedule precision does not support a five-minute job. After deployment, place these two values in Supabase Vault under the exact names used by `supabase/cron/install-indexer.sql`:

- `covra_indexer_url` = `https://<final-vercel-host>/api/indexer/sync`
- `covra_indexer_cron_secret` = the same secret as Vercel's `INDEXER_CRON_SECRET`

Run the reviewed SQL file only after the hosted endpoint responds. It installs `*/5 * * * *` through `pg_cron` and `pg_net`, then verify `cron.job` and `cron.job_run_details`. The repository cannot claim Cron operational until an authenticated run has returned success, the cursor has advanced, and the reconciliation report is consistent.
