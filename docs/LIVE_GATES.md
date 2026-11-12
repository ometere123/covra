# Evidence required before a transactional public launch

Testnet evidence and commercial-launch requirements are tracked separately. The [execution checkpoint](EXECUTION_CHECKPOINT.md) records the latest verified operations.

## Current verified position — 2026-11-12

The deployed V1 contracts are retained. The Base pool is live on Base Sepolia and currently contains `100 USDC` in class 0, all reserved by the historical pilot policy; classes 1–4 are empty. The full Bradbury adjudicator is live on Phase 2 and the first pilot has a genuine finalized `INSUFFICIENT_EVIDENCE` decision, but its case is still `DECIDED` during the three-day appeal window. No payout, settlement certificate or positive claim is asserted. The public demo and case study distinguish transaction finality, case finality, evidence-signature integrity and independent truth.

The table below is the current commercial/reviewer gate matrix, not a claim that the uncompleted gates are satisfied. Historical records in older sections of `TEST_REPORT.md` and `EXECUTION_CHECKPOINT.md` are retained for audit and are superseded by their newer dated sections.

| Gate | Acceptance evidence | Current repository state |
| --- | --- | --- |
| All five coverage terms | Insurer/legal-approved event definitions, exclusions, limits, evidence rulebooks, appeals | Research definitions only |
| Regulatory authority | Jurisdiction-specific licensed underwriter/distribution structure and legal opinion | Not obtained |
| Prices and capital | Actuarial pricing, correlation scenarios, solvency reserve and stress test | Illustrative, fixed testnet bps only |
| Base USD token | Testnet native Circle USDC address and code verified | Deployed pool is bound to Circle test USDC. Class-0 pilot funding, purchase and lock are receipt-backed; current assets/reserve are 100/100 USDC. |
| Bradbury Phase 2 | Verified `4221` identity, execution node, fee support and live contract deployment | Full adjudicator finalized and deployed source and schema matched. Finalized views and the allowlist write were verified. |
| Intelligent-contract adjudication | Multiple live validator runs with consistent evidence-based verdicts and correct appeals | Bradbury source/schema/runtime gates pass and one real negative pilot reached `INSUFFICIENT_EVIDENCE`; broader live consensus, disagreement and appeal QA remain open. |
| Cross-chain settlement | Three separately controlled keys from the frozen five-member roster validate a finalized verdict and sign the exact settlement | The deployed quorum and local adversarial tests pass. Actual signer participation, custody and live settlement remain unverified. |
| Base liquidity coverage | All five ring-fenced pools seeded with verified testnet USDC and reserve invariants tested | Five-class contract and accounting gates pass; only class 0 is currently funded and fully reserved by the historical pilot. |
| Claim lifecycle | Five real policies, frozen insured exposures, independent evidence sources, Base lock, Bradbury submit/adjudicate/appeal/finalize, signed certificate, Base payout | One genuine class-0 lifecycle reached Base lock, Bradbury adjudication and reconciliation with an honest negative result. Appeal-window finalization, attestation and payout remain unproven. |
| Security | Independent audit, fuzz/invariant tests, key-management reviews, bug bounty | Twenty Foundry tests plus 256 withdrawal fuzz runs, GenVM adversarial cases and hosted authorization checks passed. Independent audit and signer drills remain pending. |
| Backend | Signed-in reads, role boundaries, secure bucket, DB migrations, rate and origin limits, finality reindex | Production authentication, scoped agent/MCP calls, database migrations and scheduled indexer runs are verified. Reconciliation has checked the empty production ledger. |
| Data protection | Retention, consent, evidence deletion, privacy impact and breach plan | Commercial policy and operational review remain pending. |
| UI/accessibility | Browser tests, wallet-state tests, mobile usability, full WCAG audit | Production browser suite passed 33/33 across Chromium desktop, Pixel 7 and WebKit iPhone emulation, including the eight-width responsive matrix. Full WCAG audit remains pending. |
| Reliability | Incident response, monitoring, backups, SLOs and rollback | No live SLO/incident drills |
| Commercial | Underwriter/policyholder agreements, customer support, complaints/refunds, accounting | Not established |

## Hard go/no-go

1. **Do not accept real premiums or customers** unless legal authorization, accredited capital, auditable wording and pricing, audited contract, and operational controls are in place.
2. **Do not claim cross-chain payouts are automatic**. The threshold verifier is not a trustless bridge and independent attestors still have to be built and verified.
3. **Do not represent mock dashboard totals as actual USDC balances**. The product must show zero, unavailable, awaiting deployment or synchronization error states until live chain/index data exists.
4. **Do not deploy previous Bradbury or StudioNet contract addresses**. Bradbury Phase 2 is reset; chain 4221 is the correct testnet.
5. **Do not ship secrets**. Put actual keys only into `.env.local` and encrypted deployment secret storage.

## Recommended post-setup acceptance trace

For **each of the five classes**: fund pool → create wallet session → issue signed quote → approve exact Base Sepolia USDC → purchase → await Base confirmation → index policy → submit well-formed claim → attach independently checkable evidence → post case to Bradbury → independently adjudicate → appeal/re-adjudicate if appropriate → verify finality and digest → produce three independent attestor signatures → settle Base USDC → confirm recipient balance and reserve release → verify indexer/UI consistency. Also execute negative cases (expired quote, wrong beneficiary, rejected evidence, absent quorum, replay, owner/agent permission limit, unfunded pool, reorg, stale attestation).
