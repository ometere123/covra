# COVRA independent reviewer readiness — aspirational 5 / 5 / 5 / 5

This is an **evidence checklist, not an awarded score**. Source quality and demo quality can be prepared offline. A reviewer cannot award a complete score solely from this ZIP, especially for a genuinely two-chain, financially sensitive insurance product.

## Current verified position — 2026-11-12

The current V1 deployment is live and retained: Base Sepolia pool `0xd8619d3948c08c8364fd3a7a35dc8a65b254a8e4`, Bradbury Phase 2 adjudicator `0xaefc8672272392310a2ea102787e28bb1f34e1d3`, Circle test USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. The first funded class-0 pilot has receipt-backed Base deposit, purchase and claim lock, a finalized Bradbury `INSUFFICIENT_EVIDENCE` decision, and zero payout. Its Bradbury transaction receipts are finalized, but the case is still `DECIDED` during the appeal window; the earliest lawful case finalization is `2026-11-14T09:41:17Z`.

The current gates are materially ahead of the historical checklist: `genlayer:validate` and live-node COVRA schema extraction pass against the pinned v0.3 runner; Direct Mode is 24/24; JavaScript/Node is 119 Vitest + 12 TAP; Foundry is 21 behavioral + 256 withdrawal fuzz runs; TypeScript, production build and live deployment health pass. The full production WebKit suite is now 11/11, including the eight-width matrix; Chromium/mobile production checks also passed. The unresolved gates are real: independent attestor custody/operator review, independent third-party evidence, a positive covered claim, full appeal/finalization/settlement proof, formal audit and commercial/legal/actuarial authorization.

V1 is retained and no V2 contract is justified by this review: the changes are read-model verification, loading-state honesty, public snapshot freshness, tests and documentation. A future substantive adjudicator change must be deployed as a versioned Bradbury contract with a matching Base pool; it must not be silently pointed at the current V1 pool.

## Product and intelligent-contract fit

**Target:** A coherent, five-category agent-facing insurance experience that genuinely needs GenLayer's validator consensus for external evidence judgments rather than placing an ordinary deterministic USDC escrow behind AI branding.

**In source:** Five frozen individual-risk products, precise subject/reference/issuer scope, class-specific immutable terms, API/MCP agent quote/claim issuance, GenLayer validator evidence comparisons, Base capitalization and signed payout certificates.

**To verify live:** Five independent real cases, at least one positive and negative control in each class, measured validator disagreement and appeal, public traceable finalization.

## Intelligent Contract logic and safety

**Target:** Strong adversarial state transitions, deterministic invariants around nondeterministic judgment, complete failure paths and documented decision boundaries.

**In source:** Bounded evidence/issuer assertions, five objective fact predicates, three-day single-appeal finality, owner-bound case identity, separate Base/Bradbury claim-agent delegations, 45-day ordinary claim reserve plus bounded attested extensions, EIP-712 terms/risk/evidence/result/revision/beneficiary binding, distinct 3-of-5 signers and replay protection.

**Verified locally:** The actual contract passes two installed `gltest` Direct Mode tests, including positive and insufficient-evidence adjudication. **To verify live:** Bradbury Phase 2 v0.6 transaction execution and mutation tests, GenVM lint, fee burn/refund traces, full appeals and finalization under validator disagreement; formal or fuzzed Base invariants.

## Engineering / reproducibility

**Target:** Clean reproducible builds, fixtures clearly separated from truth, secure sessions/scoped API keys, deployment manifests, threat model and production-like indexing.

**In source:** Next.js/Supabase/MCP, eight ordered migrations, 57 Vitest, 7 Node, 8 host-logic Python and 2 Direct Mode tests, 18 executed Foundry scenarios, hosted signed-issuer protocol, independently rechecked attestor preflight and signing, exact beneficiary delegation limits, unique active claim intake and owner-only unanchored withdrawal, receipt-backed dual-chain appeal recovery, leased full-lifecycle indexer/reconciliation report, SDK-wired fee-aware browser lifecycle and explicit env example.

**To verify live:** Actual Base/Bradbury deployments, 3/5 independently controlled signers, tested transaction receipt and reorg recovery, load/rate limits, execution of the compiled Foundry tests plus fuzz/invariants and external security review.

## Usability and presentation

**Target:** Premium original visual design and intuitive owner, agent and underwriter journeys that distinguish demo values, submitted claims, adjudications, certificates and actual paid USDC.

**In source:** Original editorial UI, five coverage workspaces, quote/policy/claim/pool/agent journey, explicit GenLayer lifecycle, certificate submission, verification recovery and demo distinctions.

**To verify live:** Mobile, keyboard/screen-reader and Playwright browser flows for five classes; wallet rejection, wrong chain and account change; actual explorer receipt links and accessible error recovery.

## P0 gates before any high score claim

1. Deploy on Bradbury and validate that `genlayer-js@2.0.0-rc.2`/CLI `0.40.0-rc.5` fees and the deployed GenVM runner match the live network.
2. Establish independently verifiable approved evidence issuers and validate each issuer's signatures/provenance; a SHA-256 digest alone cannot make a report truthful.
3. Execute each GenLayer lifecycle and mirror the exact appeal evidence revision on Base; automate state reconciliation and refunds.
4. Build and operate **independent** attestor identities and actual claim-by-claim finality verification, not a five-key operator shortcut.
5. Exercise full five-class EVM and GenVM tests, fault injection, property fuzzing, replay and reserve stress.
6. Audit, document incidents/controls, and obtain insurer/legal/actuarial authorizations before discussing mainnet or real premiums.

**No current 5/5/5/5 score is asserted.** Completion means all above steps have reviewable transaction IDs, CI logs, reproducible tests, screenshots and a true risk statement.
