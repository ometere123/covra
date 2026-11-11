# Base Sepolia lifecycle indexer

Verified live on 2026-11-03: Supabase Cron job `1`, `covra-indexer-five-minute`, active `*/5 * * * *`. Scheduled execution at 01:10 UTC succeeded; pg_net response id 1 returned HTTP 200 without timeout. The durable cursor advanced from 53730951 to 53731653, with an indexer success row and no error. The authenticated reconciliation report had zero mismatches for the currently empty policy/claim ledger. RPC log retrieval is paginated into inclusive 200-block requests within each bounded backfill.

The indexer is a resumable operational read model. Base Sepolia receipts and state remain the settlement source of truth; Supabase never authorizes a payout by itself.

The current deployment uses stream `base-84532:0xd8619d3948c08c8364fd3a7a35dc8a65b254a8e4`; historical cursors are preserved. Event deduplication and projections commit atomically; failed projections roll back so retries cannot skip them. Lease renewal/fencing protects both event writes and cursor advancement. Claim association requires the exact owner-bound claim digest. Scheduled01:25,01:30 and01:35 UTC executions advanced this stream successfully.

Migration011 adds durable claim follow-ups. Each authenticated sync processes up to ten due jobs independently before Base RPC calls. Database-triggered enqueue avoids a crash gap after claim insertion. Successful nonterminal checks are due hourly; failures use five-minute increasing backoff, four-minute fenced leases, and a five-attempt ceiling including crashes. FAILED jobs require owner/claim:issue reset through POST /api/agents/followups. GET requires owner or claim:read; MCP lifecycle inspection exposes the same job checkpoint. Jobs do not mark payouts or sign transactions. The scheduler remains Supabase Cron, functional with the operator's PC switched off.

## API

- `POST /api/indexer/sync` with `Authorization: Bearer INDEXER_CRON_SECRET`.
- `GET /api/indexer/reconciliation` with the same operator credential.

Each sync waits for 12 Base Sepolia confirmations, reads up to 2,000 blocks, and indexes the complete relevant `CovraPools` event set. It uses `indexer_cursors` for the canonical cursor and block hash, `indexer_leases` to prevent overlapping runs, and `indexer_runs` for execution history. Event records use the `(chain_id, tx_hash, log_index)` primary key for idempotency.

The lifecycle stream covers every emitted `CovraPools` event: capital deposits, withdrawals and recapitalization; purchase and expiry; claim locking, evidence revision and resolution extension; denial and settlement; agent and claim-agent authorization; pause, quote-signer, attestor-roster and ownership changes. The shared ABI is regression-tested against the Solidity event list. Policy state and claim terminal status are updated only as a consequence of a decoded on-chain event. Existing terminal states are not silently rolled backward by replay. A claim-resolution extension is stored as an indexed deadline and checked against the live contract during reconciliation.

Each decoded event also stores the canonical Base block timestamp in `claim_chain_events.block_timestamp`. Rows created before this column was introduced remain readable and are labeled with their indexed `created_at` time until an operator-approved replay or backfill supplies the chain timestamp. The authenticated Activity screen exposes capital events only when the event's indexed `underwriter` matches the wallet session and links to the original Base receipt.

If the cursor block hash no longer matches the canonical Base chain, the route fails closed with `409` before accepting a replay. An operator must inspect the reconciliation report, establish a validated canonical restart point, and perform the required audited cursor/read-model repair before resuming bounded replay. The current API deliberately does not silently rewrite a reorged cursor or roll back derived terminal rows. A bounded replay body such as `{"fromBlock":"<validated block>","maxBlocks":2000}` is supported once that operator-approved recovery is complete; replay runs do not advance the cursor. A normal RPC outage needs no manual cursor change: the next run resumes from the durable cursor.

## Supabase Cron

Vercel Hobby Cron is not used: its schedule precision does not support a five-minute job. After deployment, place these two values in Supabase Vault under the exact names used by `supabase/cron/install-indexer.sql`:

- `covra_indexer_url` = `https://<final-vercel-host>/api/indexer/sync`
- `covra_indexer_cron_secret` = the same secret as Vercel's `INDEXER_CRON_SECRET`

Run the reviewed SQL file only after the hosted endpoint responds. It installs `*/5 * * * *` through `pg_cron` and `pg_net`, then verify `cron.job` and `cron.job_run_details`. The repository cannot claim Cron operational until an authenticated run has returned success, the cursor has advanced, and the reconciliation report is consistent.

The installer updates an existing job in place and leaves its owner, active flag and history intact. It sets a 30-second `pg_net` timeout to accommodate cold starts and RPC calls. Treat `cron.job_run_details` success as proof of dispatch. Verify the corresponding HTTP response and durable cursor independently, since the request may time out while the hosted worker continues.
