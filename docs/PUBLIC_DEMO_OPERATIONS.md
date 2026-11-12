# Public demo and independent operations runbook

Updated 2026-11-12. This document describes the read-only public demonstration and the operational work required before COVRA can claim a genuinely independent positive payout. It is not an insurance policy, underwriting approval or commercial launch authorization.

## Public demonstration

The public, wallet-optional pages are:

- Production protocol tour: [covra-lyart.vercel.app/demo](https://covra-lyart.vercel.app/demo)
- Production first-pilot case study: [covra-lyart.vercel.app/case-study/first-pilot](https://covra-lyart.vercel.app/case-study/first-pilot)
- Existing workspace: [covra-lyart.vercel.app/app](https://covra-lyart.vercel.app/app)

The pages are receipt-backed. Their source of truth is the committed deployment and lifecycle records under `docs/deployments/`, plus a fresh read of the Base and Bradbury status endpoints. They do not read or render the fixture data removed from the operational workspace. If a live RPC status read fails, the status panel says `UNAVAILABLE`; it does not infer deployment from an environment variable. The reserve panel is deliberately labelled as a historical Base snapshot, with its block number, block hash and block timestamp; the live status panel is the separate fresh verification signal.

The case study records the first class-0 Service Failure pilot:

- Base pool: `0xd8619d3948c08c8364fd3a7a35dc8a65b254a8e4` on Base Sepolia `84532`.
- Bradbury adjudicator: `0xaefc8672272392310a2ea102787e28bb1f34e1d3` on Bradbury Phase 2 `4221`.
- Policy: `0x888bc262dc251cda642d6843a3d69e94d403871a88ee8e570c04f6c4be7eafcd`.
- Claim: `0xc9ba090e3706d89d43faa1cde6afe0cb2d1b0cb961cf0d9105073addea127223`.
- Decision: `INSUFFICIENT_EVIDENCE`; no payout was authorized or broadcast.
- Evidence envelope: `https://covra-lyart.vercel.app/api/evidence-issuer/observations/class0-covra-service-failure-pilot-2026-11-11-01`.

The Bradbury `submit_case` and `adjudicate` transactions both reached `Finalized / FinishedWithReturn`. That is transaction finality, not case finality. The case record remains `DECIDED`, revision `0`, with `appeal_used=false`; the earliest permitted `finalize_case` time is `2026-11-14T09:41:17Z`. The public case study uses `TRANSACTIONS FINALIZED` and `DECIDED / WINDOW OPEN` so these states are not conflated.

The record deliberately states that the observation workflow, issuer and test attestors were under common COVRA test custody. A valid signature establishes envelope integrity and issuer identity; it does not establish that the underlying event is independently true.

## Attestor independence and delayed rotation

The deployed pool uses a five-member roster, threshold three, and claim roster snapshots. The current functional test keys match the five registered addresses, but they are common-custody test identities:

`FUNCTIONAL_QUORUM_VERIFIED / OPERATOR_INDEPENDENCE_NOT_VERIFIED`

No rotation is being performed for the public demo. Existing claims retain their recorded roster version and signer set. The detailed volunteer package is [ATTESTOR_ONBOARDING.md](ATTESTOR_ONBOARDING.md). A future owner-authorized rotation must use the deployed delayed rotation mechanism and this checklist:

1. Recruit at least three volunteers who operate independently and can attest to their own custody and availability. The owner must record the operational independence limitation rather than infer it from distinct addresses.
2. Each volunteer generates a fresh key locally, retains the private key locally, and sends only the checksummed public address through the onboarding channel. COVRA must never request, receive or export the key.
3. Run read-only verification against Base Sepolia: expected chain, pool address, current roster version, address membership and enabled status. The volunteer signs a non-settlement challenge locally and verifies recovery before any rotation request.
4. Confirm each signer can independently read the exact Bradbury finalization transaction, adjudicator address, case identifier, revision, decision digest and frozen Base terms. The read-only verifier must reject wrong chain, wrong contract, stale revision, unfinalized execution and modified digest.
5. The owner submits the protocol's delayed rotation request for the exact new roster. Record request transaction, old and new roster versions, effective time and cancellation/expiry rules. Do not shorten the delay or overwrite the old roster.
6. After the delay, the owner executes the scheduled rotation only after rechecking all five addresses and the threshold. Save the receipt and a fresh on-chain roster read.
7. Run quorum tests with three separately controlled operators, including duplicate, forged, wrong-chain, wrong-claim, wrong-beneficiary, expired and replayed certificates. A certificate is functional evidence, not proof that the operators are economically or organizationally independent.
8. Keep a contact/availability runbook outside the chain. A missing operator must fail closed; it must not be replaced ad hoc by a deployment key, issuer key or quote signer.

The deployer, quote signer, evidence issuer and attestors remain distinct roles. The current common-custody test configuration is not suitable for a production claim of decentralized or independent operation.

## Independent evidence options

### UptimeRobot

UptimeRobot's current free plan documentation describes up to 50 monitors, five-minute checks, a basic status page and three months of monitoring-data retention. The API exposes monitor/status data, but COVRA must verify which event/log fields the account and API version actually expose before binding them to a policy. The provider's current free-plan page says business/commercial use is allowed; legal and provider terms still require review before a commercial launch.

Useful primary references:

- [UptimeRobot free plan](https://help.uptimerobot.com/en/articles/11604710-who-should-use-uptimerobot-s-free-plan)
- [UptimeRobot data retention](https://help.uptimerobot.com/en/articles/11360873-what-is-uptimerobot-data-retention-and-how-does-it-work-in-different-plans/)
- [UptimeRobot API](https://uptimerobot.com/api/)
- [UptimeRobot status page](https://help.uptimerobot.com/en/articles/11361341-uptimerobot-status-page-feature-how-it-works)

UptimeRobot is a candidate monitor, not settlement-grade evidence by itself. A qualifying specification still needs a named provider/endpoint, frozen monitor configuration digest, policy-bound start/end times, raw API response capture, retrieval timestamp, response hash, independently retrievable history and an issuer signature. A public status page can be controlled or corrected by the service owner and must not be treated as an immutable external oracle.

### Better Stack

Better Stack documents incident API access with Bearer authentication, incident timestamps/status/cause and monitor URL fields. Its heartbeat monitor can open an incident when a secret heartbeat is missed. The current pricing page describes the free tier as for personal projects, with ten monitors/heartbeats, one status page and short log retention; COVRA must not represent that tier as commercially permitted without confirming the account terms.

Useful primary references:

- [Better Stack list-incidents API](https://betterstack.com/docs/uptime/api/list-all-incidents/)
- [Better Stack heartbeat monitors](https://betterstack.com/docs/uptime/cron-and-heartbeat-monitor/)
- [Better Stack status updates](https://betterstack.com/docs/uptime/creating-status-report-and-status-update/)
- [Better Stack pricing](https://betterstack.com/pricing?authuser=0)

Better Stack is also only a candidate source. A heartbeat missed by a COVRA-controlled task is not an independent incident, and a provider dashboard does not prove the contractual cause or penalty. Before use, freeze the monitor, subject, heartbeat owner, endpoint, acceptable outage rule, retention period and API response schema. Preserve the raw response and a provider-verifiable URL or export; do not sign an assertion based only on a screenshot or a mutable status-page label.

### Source-readiness decision

Neither provider has been configured as a settlement source for the first pilot. No external provider account, monitor, status page or incident was created by this release. The smallest credible positive-evidence path is a provider/endpoint that is not controlled by the insured or COVRA, has an independently retrievable incident record, exposes timestamps and cause, retains the record through the claim and appeal windows, and can be bound to a frozen policy specification before purchase. If those properties cannot be verified, COVRA must keep the claim pending or deny it; it must not relabel a controlled testbed observation as independent.

## Current reserve and lawful release path

At Base Sepolia block `57599154`, mined at `2026-11-12T00:01:39.000Z` with block hash `0xb0be77e229b86ee661c78751869afba7b5579666116ae40c190b9349b8c5138d`, a verified historical read returned:

- Policy `0x888bc262dc251cda642d6843a3d69e94d403871a88ee8e570c04f6c4be7eafcd` state `ACTIVE / 1`.
- Claim lock `0xc9ba090e3706d89d43faa1cde6afe0cb2d1b0cb961cf0d9105073addea127223`, revision `0`, roster version `1`.
- Class-0 pool assets `100 USDC`, reserved `100 USDC`, premium `1 USDC`, paid `0 USDC`, total shares `99,000,000` (99 USDC at the pool's six-decimal share scale).
- `usedClaim` is false and no payout transfer exists.
- Claim deadline: `2026-11-26T09:16:31Z`.
- Claim-resolution deadline: `2027-01-10T09:16:31Z` (`claimDeadline + 45 days`); no extension is recorded.

The deployed `CovraPools.releaseExpired(policyId)` path is permissionless but fail-closed: it requires an active policy, a passed claim deadline and, when a claim lock exists, a time strictly after `claimResolutionDeadline`. It transitions the policy to expired and reduces pool `reserved` by the policy limit. It does not send USDC to the claimant and is not a payout. No release transaction was attempted. After a successful release, the LP must separately re-read `sharesOf`, `pool` and `availableCapital`, then call `withdraw(coverageClass, shares)`; withdrawal remains pro-rata and cannot exceed available capital. The recovery artifact is [`class0-reserve-read-2026-11-12.json`](deployments/class0-reserve-read-2026-11-12.json).

Because the finalized Bradbury result is `INSUFFICIENT_EVIDENCE`, the current claim is not eligible for either covered or not-covered settlement. A later appeal cannot be invented to change that result. The earliest lawful reserve-accounting release for this locked policy is after `2027-01-10T09:16:31Z`, subject to the chain timestamp and the contract's exact state checks. If a valid, properly evidenced appeal produces a new final verdict before then, the claim must follow that verdict and its exact settlement rules; a timer must never convert a challenged claim into a covered payout.

## Requirements for a genuine positive payout

All of the following remain mandatory:

1. A new or existing policy must have frozen terms, a named insured subject, valid Base purchase receipt, indexed policy and sufficient class-specific reserve.
2. Evidence must come from an attributable, independently reviewable source available after policy inception and before the applicable deadline. The raw response, retrieval time, source URL, facts digest and issuer envelope must bind to the exact policy and claim.
3. Bradbury must submit, execute, finalize and expose the exact case decision and digest for the current revision. `Accepted` is not execution success and a stale or superseded case cannot settle.
4. The full 72-hour appeal window must pass. If an appeal is submitted, the revised decision and its finalization window supersede the earlier decision.
5. Three valid signatures from the frozen roster must authorize the exact chain, pool, policy, claim, decision revision/digest, beneficiary, amount and expiry. The current functional keys may prove cryptographic mechanics only; three independently controlled operators are still required for an independent-operations claim.
6. The Base settlement simulation, receipt and event logs must verify exact provenance, reserve bounds and one-time payout. The recipient balance, pool accounting, Supabase indexer and frontend must reconcile to the same receipt.

Until those gates are evidenced, the correct public result is `INSUFFICIENT_EVIDENCE`, pending, denied or unavailable—not a simulated payout.

## First-pilot finalization procedure

The procedure is read-only by default and is implemented in [`scripts/finalize-class0-case.mjs`](../scripts/finalize-class0-case.mjs). It checks the Bradbury Phase 2 chain ID `4221`, the expected genesis, the deployed adjudicator, the exact case/policy binding, the current finalized case read, the original revision and no-appeal state, and the 72-hour decision timestamp gate.

Run the safe read-only check with the existing protected environment:

```text
npm run genlayer:finalize-class0
```

Before `2026-11-14T09:41:17Z`, the expected result is `APPEAL_WINDOW_OPEN`; no transaction is submitted. After that time, re-run the read-only command immediately before the operation. Only if the case is still revision `0`, `DECIDED`, `INSUFFICIENT_EVIDENCE` and `appeal_used=false`, and no valid appeal has changed it, the explicitly gated command may be used:

```text
npm run genlayer:finalize-class0 -- --broadcast --confirm-case 0xc9ba090e3706d89d43faa1cde6afe0cb2d1b0cb961cf0d9105073addea127223
```

The broadcast path obtains a fresh nonzero v0.6 fee estimate, submits exactly `finalize_case(caseId)` to the existing adjudicator, waits for `Finalized / FinishedWithReturn`, checks the post-write case state and `finalized_at`, and reads `get_decision_digest`. It never retries a submitted hash. The resulting hash must then be recorded through the existing chain-proof/reconciliation path and independently checked before any attestation. `INSUFFICIENT_EVIDENCE` remains non-settleable; finalizing the negative case does not create a payout authorization.
