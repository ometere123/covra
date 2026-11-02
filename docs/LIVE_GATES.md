# Evidence required before a transactional public launch

**Code-complete is not business-ready.** No claim that these gates passed is made by the ZIP.

| Gate | Acceptance evidence | Current repository state |
| --- | --- | --- |
| All five coverage terms | Insurer/legal-approved event definitions, exclusions, limits, evidence rulebooks, appeals | Research definitions only |
| Regulatory authority | Jurisdiction-specific licensed underwriter/distribution structure and legal opinion | Not obtained |
| Prices and capital | Actuarial pricing, correlation scenarios, solvency reserve and stress test | Illustrative, fixed testnet bps only |
| Base USD token | Testnet native Circle USDC address and code verified; no mock mismatched token | Contract configured, live tests pending |
| Bradbury Phase 2 | Verified `4221` RPC, separate GenLayer node RPC, v0.6 CLI/JS/GenVM, fee support and live contract deployment | EVM RPC known; node availability / contract execution unverified |
| Intelligent-contract adjudication | Multiple live validator runs with consistent evidence-based verdicts and correct appeals | Python source with bounded SHA-256 evidence and 3-day appeals; **still needs real network QA** |
| Cross-chain settlement | Five actually independent attestors validate final Bradbury state and signed issuer observations; perform positive/negative malicious signer tests | Preflight, separately run EIP-712 signer and quorum aggregation code are supplied; independent operation not deployed |
| Base liquidity coverage | All five ring-fenced pools seeded with verified testnet USDC and reserve invariant fuzzed | Contract source; no funded deployment |
| Claim lifecycle | Five real policies, frozen insured exposures, independent evidence sources, Base lock, Bradbury submit/adjudicate/appeal/finalize, signed certificate, Base payout | UI and API actions exist, no real Phase 2/Basescan lifecycle executed here |
| Security | Independent audit, fuzz/invariant tests, key-management reviews, bug bounty | Typecheck, host-side regression tests and 18 executed Foundry cases; no independent audit, live DB test or independent signer drill |
| Backend | Signed-in reads, role boundaries, secure bucket, DB migrations, rate and origin limits, finality reindex | Backend code, eight ordered migrations, one-active-claim constraint, exact receipt reconciliation, leased full-lifecycle indexer and reconciliation report; live DB/Cron verification pending |
| Data protection | Retention, consent, evidence deletion, privacy impact and breach plan | Design documentation needed |
| UI/accessibility | Browser tests, wallet-state tests, mobile usability, full WCAG audit | Three Chromium smoke tests pass; wallet-state/full lifecycle and independent accessibility audit remain pending |
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
