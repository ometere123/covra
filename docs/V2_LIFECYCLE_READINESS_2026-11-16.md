# V2 lifecycle readiness — 2026-11-16

## Decision

**`BLOCKED_BEFORE_SPEND`**.

The V2 Bradbury/Base pair is deployed and the nonfinancial evidence-host
allowlist is configured, but COVRA does not currently have a legitimate,
policy-compatible external incident that can be observed and retained through a
V2 case. No USDC approval, deposit, purchase or claim-lock transaction was
broadcast for V2.

This is an evidence-readiness blocker, not a contract-deployment blocker. The
machine-readable read-only result is
[`v2-readiness-2026-11-16.json`](deployments/v2-readiness-2026-11-16.json).

## Verified live state

The read-only verifier ran against Base Sepolia head block `59644404` at
`2026-11-16T17:39:09Z` and checked Bradbury Phase 2 independently.

- Base chain: `84532`; Circle test USDC:
  `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
- V2 Base pool: `0x208f1b9c5694d9fbde32c81b0489db922e33263c`.
  The deployment receipt is
  `0x6f41570b4c89d332b5f502f80c29faf3255dc7afbb8e0a42406806aab8d88d04`.
- Bradbury chain: `4221`; genesis:
  `0x17d89764d4f4f963158fc4c5e8f2cb670c2837740b35f37081c12860c3df97e4`.
- V2 adjudicator: `0x71B1Fb863F29c29D4C3f6423196b60589538E491`.
  The staged activation is finalized with digest
  `0x3009c8f48fa380c73879a2c65652931ed0438a2e8e55eda27be59c1df05203ed`;
  live finalized reads return `COVRA_ADJUDICATOR_V2`, case count `0`, and an
  empty unknown-case decision digest.
- V2 evidence host `covra-lyart.vercel.app` was enabled by owner transaction
  `0x93fd6f9967504baf2c0483f47596e410d463e40bee54467a90e0c30de9941e0c`,
  finalized as `FinishedWithReturn`. Its durable receipt is in the JSON record.
- V2 role and binding checks passed: the Base pool points to the V2
  adjudicator, source chain is `4221`, Circle USDC is immutable, the quote
  signer and evidence issuer are distinct, and all five configured attestor
  addresses are authorized.
- Every V2 class is currently empty: assets, reserved, premiums, paid, total
  shares, available capital and owner shares are all zero.
- The funding wallet is `0xa5840e65a15021d8b1648dB10176c04811f07873`. The
  current read-only balance is `5,000,000` micro-USDC (`5 USDC`) and
  `139926591313029766` wei Base Sepolia ETH. No V2 capital is inferred from
  configuration.

## Scenario evaluation

Class 1, **Dependency outage**, is the strongest future candidate because its
testnet rate is the lowest of the five classes and its objective rule is
bounded: a named provider, at least 30 outage minutes, and at least two
independent probes. Public status APIs are currently reachable, but that is not
a qualifying incident and their payloads are not the exact
`covra-independent-source-v1` records required by the immutable V2 contract.

The current hosted issuer deliberately labels every observation
`COVRA_CONTROLLED` with zero independent observers. It can prove retrieval,
canonical bytes and issuer signature, but it must not authorize a covered
decision. V2 requires the origin manifest to be re-fetched and to contain at
least two distinct public source hosts whose committed records reproduce the
same frozen facts. A self-reported provenance label or observer count does not
establish that property.

The live public checks found the following healthy JSON summaries:

| Source | Result | Why it is not yet settlement evidence |
| --- | --- | --- |
| `https://status.openai.com/api/v2/summary.json` | HTTP 200, 5,296 bytes | Provider summary schema, not `covra-independent-source-v1`; no frozen policy-bound incident |
| `https://www.githubstatus.com/api/v2/summary.json` | HTTP 200, 4,310 bytes | Different provider summary schema; no shared COVRA facts or policy binding |
| Better Stack incident API | Documented API exists | Requires a configured monitor/account and authenticated API access; no COVRA-retained incident exists |

Better Stack documents incident retrieval and status-page history, but those
interfaces still require a frozen monitor, retained raw response and an
independently reviewable attribution before they can be used in a policy. The
official documentation is [List incidents](https://betterstack.com/docs/uptime/api/list-all-incidents/)
and [status-page resources](https://betterstack.com/docs/uptime/api/get-a-single-status-page-resource/).

Class 0 is not selected: the prior V1 controlled task is historical, was
common-custody and cannot be reused as a new V2 incident. Classes 2–4 require
subject-specific mandate, on-chain incident or business-baseline evidence that
is likewise not currently available from an independent source.

## Pre-spend checkpoint (not authorized)

If a qualifying independent source and event become available, the shortest
mathematically valid candidate is a **class-1, one-day policy** at the current
minimum coverage:

- Coverage limit: `100 USDC` (`100,000,000` micro-USDC).
- Deterministic quote premium: `1 USDC` (`1,000,000` micro-USDC); the configured
  minimum premium applies at one and seven days.
- Minimum class-1 pool deposit: `99 USDC` (`99,000,000` micro-USDC), because
  `pool.assets + premium >= pool.reserved + limit`.
- Total USDC required from the owner: `100 USDC` (`99` deposit + `1` premium).
- Expected initial LP shares: `99,000,000` at an empty-pool 1:1 share rate.
- Reserved after purchase: `100 USDC`; available capital after purchase: `0`.
- Quote timing: starts about 15 minutes after issuance, ends after one day,
  claim deadline is 14 days after the end, and a timely claim keeps the
  reserve through the contract's additional 45-day settlement grace period.
  The exact timestamps must come from the live signed quote.
- Seven days costs the same minimum premium but lengthens the observation
  window; it is preferable only after an independent monitor is actually
  configured. Neither duration is currently authorized for purchase.
- Current wallet shortfall for the one-day minimum is `95 USDC`. No request to
  use V1's reserved 100 USDC is made or permitted.
- Bradbury writes require fresh account-aware FeeManager estimates. The latest
  nonfinancial V2 host write quoted a `0.100000000000010352 GEN` deposit and
  finalized successfully; submit/adjudicate estimates must be refreshed after
  a real case exists. No fixed fee is hardcoded.
- The Base ETH balance is visible above, but exact approval/deposit/purchase
  gas must be simulated immediately before any approved write.

The spend amount is therefore **not approved**. A funding checkpoint can only
become `READY_TO_DEPOSIT_AND_PURCHASE` after the evidence source, frozen subject,
monitoring specification, retention and claim-intake path are all verified, and
after explicit approval of the exact `99 USDC + 1 USDC` sequence.

## Required external prerequisite

The smallest blocker is one of:

1. A genuinely independent operator/source that publishes two distinct,
   publicly retrievable, policy-bound `covra-independent-source-v1` records for
   the same event and retains them through adjudication and appeal; or
2. An explicitly authorized controlled test with an external participant,
   frozen task/terms before inception, and a source/penalty record that the
   adjudicator can independently retrieve. It must remain labelled as a
   controlled test and cannot be presented as an independent real-world event.

Until then, the correct V2 state is deployed, verified, unfunded and not ready
for a financial lock. No positive payout, settlement certificate or independent
attestor operation is claimed.
