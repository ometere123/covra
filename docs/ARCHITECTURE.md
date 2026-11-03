# COVRA: system architecture and trust boundaries

**Client**: Next.js 16 App Router, React 19, TypeScript, custom responsive design system, injected EIP-1193 wallet, Base Sepolia transaction signing and confirmation.

**Server**: Wallet nonce/signature authentication in httpOnly sessions; separately scoped agent API keys for reads, quote issuance and claim intake; server-generated EIP-712 quote; frozen insured-exposure digest; issuer-host-bound claims; independent chain-receipt reconciliation. PostgreSQL and private Supabase Storage track application data, never settle USDC.

**Base**: CovraPools.sol holds native testnet Circle USDC on Base Sepolia across five separate accounts, share ledgers and reserving pools. Full depletion retires an LP share epoch before new deposits. Quotes freeze exact insured-risk and class-terms hashes. One authorized Base claim lock and one appeal revision are allowed, with expiry grace of 45 days or a bounded 3-of-5-signed extension up to 105 days. Settlement is available even if new purchases are paused; denial releases reserve without token transfer. Construction requires the deployer, quote signer, evidence issuer wallet and all five attestors to be pairwise distinct; each claim snapshots the five-member roster version.

**Bradbury**: CovraAdjudicator.py (4221) receives a case ID cryptographically derived from owner wallet plus claim UUID, requires wallet ownership or unexpired delegated agent authorization, and binds the individual insured risk. Validators independently read SHA-256-fixed signed-evidence envelopes from explicitly approved HTTPS hosts. UI exposes submission, adjudication, appeal, finalization and readback with fee-aware GenLayer SDK. GenLayer alone never transfers Base USDC.

**Attestors**: Exactly five authorized public identities, quorum three. Independent operation and signing custody remain unverified. Each operator must verify the finalized Bradbury case, issuer signature and frozen risk, event eligibility, actual Base policy and lock, exclusions and deterministic cap. Claim locks snapshot the roster; delayed replacement cannot change an existing claim's required signers. Read-only preflight, isolated single-operator signing and aggregation scripts are supplied. Base verifies distinct signatures; this is a trusted quorum, not a light-client bridge.

**Durable follow-up**: Migration011 queues one job atomically with each real claim through a database trigger. Existing Supabase Cron processes ten due jobs at most per invocation, with skip-locked selection, four-minute fenced leases, persisted checkpoints, bounded retry backoff and explicit owner/scoped-agent recovery after five failed attempts. Successful checks recur hourly; no Vercel process sleeps between checks. The earlier unused Workflow SDK definition is replaced by this actual Supabase-backed execution path, avoiding another managed queue/storage dependency. GET/POST /api/agents/followups are owner/scope-bound; MCP lifecycle inspection includes the same checkpoint. A follow-up is read-model monitoring, never wallet-spending or settlement authority.

## Authority matrix

| Operation | Authority |
| --- | --- |
| Fetch rates and public risk catalogue | Anyone; non-binding |
| Request executable signed quote | Wallet-authenticated insured or scoped agent; agent beneficiary must equal insured |
| Approve/purchase USDC policy | Insured wallet (may name third-party beneficiary) or separately authorized, funded agent wallet (insured beneficiary only) |
| Submit claim/evidence to API | Insured wallet session or scoped claim:issue agent credential; onchain writes require owner or delegated wallet |
| Withdraw an unanchored claim intake | Insured wallet session only, after verified unlocked Base state and explicit no-pending-transaction acknowledgment |
| Analyze external evidence | Bradbury GenLayer validator consensus |
| Pay USDC from Base pool | Base contract receiving 3/5 valid distinct finality attestations |
| Rotate attestors and signer | Base contract owner; 48-hour five-member replacement delay; existing claims keep their snapshot |

## Replay and safety

- Quote EIP-712 binds policy ID, insured wallet, beneficiary, class, premium/limit, windows, unique insured-risk SHA-256 digest, class terms hash, nonce and deadline to Base Sepolia 84532 and exact pool address.
- Decision EIP-712 binds Base policy/claim, Bradbury finalized decision and tx, evidence and result digests, frozen risk and terms hashes, class, verdict, revision, beneficiary, amount, expiry, source chain 4221 and adjudicator address.
- Used policy and claim IDs plus policy terminal state prevent settlement replay; transfers use non-reentrant checks and verify token receipt amounts.
- An API key is **not** custody of an owner wallet. On-chain delegated purchases debit the **agent's** USDC, not the owner's.
- Both quote signing and the Base pool enforce `beneficiary == insured` on agent-originated purchases; delegated premium limits cannot be used to redirect proceeds.
- PostgreSQL enforces one non-cancelled intake per policy using a partial unique index. Idempotency keys are bound to the exact claim data, and cancelled intake records remain auditable.

## Claim lifecycle

Read model: intake → Base locked → Bradbury submitted → decided → appeal or finalized → independently certified → Base paid/denied. The chain-proof API records confirmed Base logs and final Bradbury state, but deep reorg rollback, unrelated GenLayer transaction correlation and independent signer availability still require production-grade infrastructure.

An unanchored intake may be withdrawn by its insured owner only after a live Base lock read shows no claim. This is not an on-chain claim cancellation, and pending wallet transactions must be checked before withdrawal. Agent credentials cannot withdraw claims; revoke compromised API and on-chain grants independently.

Appeals are **not atomic across the two chains**. The browser first submits the Bradbury appeal within its three-day window, persists the finalized proof and a pending digest, then spends Base's one evidence revision. The `APPEAL_SYNC_PENDING` state means the second leg still needs verification. On each retry the client reads both chains, validates the exact digest/revisions, and executes only the missing leg. Recovered receipts may require the user to paste the actual transaction hash. The database never treats this intermediate state as a payout authorization.

GenLayer: `SUBMITTED → DECIDED → (after 3 days) FINALIZED`; one appeal returns to `SUBMITTED`, revision increments and requires re-adjudication. No digest is returned before `FINALIZED`. Do not sign or pay an appealable/stale result.

## External verification prerequisites

The Bradbury public chain EVM RPC alone is **not** sufficient evidence that GenLayer-specific methods, non-deterministic execution or validators are reachable. A valid `BRADBURY_NODE_RPC_URL`, v0.6-compatible runner and actual deployment trace are mandatory for live claim adjudication.

The lifecycle event indexer waits 12 Base confirmations, checks block hashes, prevents overlapping runs, records bounded replay/run history and exposes a reconciliation report. Deep-reorganization rollback still requires operator-approved replay and review. Rates are illustrative, without actuarial approval. Insurance licensing, approved wording, KYC/sanctions screening, insurer backing and catastrophe risk modeling are outside demonstrated readiness.
