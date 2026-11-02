# COVRA independent reviewer readiness — aspirational 5 / 5 / 5 / 5

This is an **evidence checklist, not an awarded score**. Source quality and demo quality can be prepared offline. A reviewer cannot award a complete score solely from this ZIP, especially for a genuinely two-chain, financially sensitive insurance product.

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
