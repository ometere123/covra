# COVRA claim, evidence and payout protocol

**Network lock:** GenLayer Bradbury Phase 2 chain **4221** for intelligent adjudication; Base Sepolia chain **84532** for ring-fenced native Circle test USDC. This repository does not use StudioNet or Arc for settlement.

**Status:** Source implementation and independent preflight are provided; audited live attestation/finality infrastructure is not yet deployed. This is not an insurance policy or a trustless bridge.

## 1. Why a two-chain protocol?

Base EVM contracts can deterministically hold USDC, verify owner authorization and enforce liquidity invariants. GenLayer validators can compare external evidence and form an opinion through a GenVM intelligent contract. Those two trust domains do **not** share a cryptographic light-client proof in this build. The explicit bridge is a timelocked, independently operated **3-of-5 signer quorum**.

No GenLayer wallet receives policy premiums, no backend API directly authorizes payouts and no single operator may be described as an independently verified threshold network.

## 2. Frozen coverage events and amount rules

| Class | Required exact evidence facts | Testnet payout rule |
| --- | --- | --- |
| 0 Service failure | `missed_deadline=true`, SHA-256 task specification, integer positive independently substantiated contractual penalty | Lesser of penalty and policy USDC limit |
| 1 Dependency outage | Approved named `provider_id`, integer `outage_minutes >= 30`, `independent_probes >= 2` | 30–59 minutes 25%, 60–119 50%, 120+ 100% of USDC limit |
| 2 Execution error | `unauthorized_action=true`, hashes of signed mandate and action transaction, positive integer verified loss | Lesser of documented actual loss and USDC limit |
| 3 DeFi incident | Allowed `incident_kind`, incident transaction hash, at least 2 independent observers, positive integer verified loss | Lesser of independently verified covered loss and USDC limit |
| 4 Business interruption | Baseline hash, at least 120 integer interruption minutes, positive integer attributable USDC loss | Lesser of independently established attributable loss and USDC limit |

All values ending in `_micro_usdc` are *integer 6-decimal native USDC units*. This is an illustrative product specification requiring actuarial/legal approval. An LLM never chooses a payout number. The mandatory data fields are checked in **both** TypeScript and the Python Intelligent Contract; the source authenticity and loss attribution remain attestor obligations.

## 3. Immutable evidence envelope

Each public issuer publishes the **exact raw UTF-8 bytes** of a compact JSON document at an approved HTTPS URL. The claimant submits the SHA-256 hash of those bytes, prefixed `0x`. Validator nodes independently fetch it; changed bytes, invalid JSON, missing facts or the wrong policy/claim/terms are rejected. Private Supabase attachments are distinct and cannot be passed off as public GenLayer observations.

For the dependency class, the following is a schema illustration only; deployed records must contain the exact bytes retrieved from an attributable public source and must never use these placeholder values:

```json
{
  "schema": "covra-evidence",
  "policy_id": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "claim_id": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "terms_hash": "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "risk_spec_hash": "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  "risk_spec": {
    "coverageClass": 1,
    "evidenceIssuerHost": "issuer.example.org",
    "referenceHash": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "statement": "Only the named API with the agreed monitoring method is insured.",
    "subject": "listed-provider"
  },
  "coverage_class": 1,
  "observation_id": "<operator-assigned-observation-id>",
  "event_time": "<canonical-event-time>",
  "observed_at": "<canonical-observed-time>",
  "observation_mode": "OBSERVED_PUBLIC",
  "source_details": {
    "issuer_host": "issuer.example.org",
    "endpoint": "https://<covra-issuer-host>/api/evidence-issuer/observations/<id>",
    "retrieval_method": "https_get",
    "source_payload_digest": "0x<sha256-of-canonical-signed-facts>",
    "origin_url": "https://<attributable-public-source>/<observation>.json",
    "origin_payload_digest": "0x<sha256-of-raw-source-response>"
  },
  "facts": {
    "provider_id": "listed-provider",
    "monitoring_method_hash": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "outage_minutes": 60,
    "independent_probes": 3
  },
  "issuer": {
    "wallet": "0x1111111111111111111111111111111111111111",
    "signed_at": 1793500000,
    "expires_at": 1803004000,
    "signature": "0x<replace-with-130-hex-character-EIP191-signature>"
  }
}
```

The *actual raw byte hash*, not the hash of an independently reserialized copy, is bound to the claim. **A valid hash proves immutability, not truthful or independent authorship.** Operators must approve and cryptographically authenticate the evidence issuer separately; user-controlled GitHub repos, self-published endpoints or uploaded PDFs are not reliable authorities by default.

## 4. Canonical identifiers

- Offchain claim UUID is created by Postgres once.
- Base claim ID and Bradbury case ID equal `SHA256(UTF8("COVRA-CLAIM:" + insured_wallet_lowercase + ":" + intake_uuid_lowercase))`. This binds every case to the insured wallet.
- Base `openClaim(policyId, claimId, evidenceDigest)` requires the insured wallet or its unexpired wallet-approved claim agent; the Bradbury case separately checks owner or delegated writer.
- One `reviseClaimEvidence` increments revision from 0 to 1 and forces new independent signatures.
- The class-specific terms hash and individual risk-spec hash freeze the exact subject, reference digest, statement and approved evidence-issuer host when the policy is purchased.
- Case identifiers, source URL and evidence commitment must be preserved across client retries. The API uses an idempotency key.

## 5. Full case lifecycle

1. Owner pays native **Circle Base Sepolia USDC** to buy a signed, reserved policy. Base contract enforces pool capacity and reserve accounting.
2. Incident must occur within start/end coverage dates. Claim intake checks owner, policy, time and cover limit. Independent attestor preflight repeats this check against Base's policy data at a 12-confirmed block even when the web API was bypassed.
3. Owner **locks** claim ID and public evidence digest on Base before deadline; reserve cannot be released early while dispute is open.
4. Owner uses **v0.6 fee-funded** `submit_case` on Bradbury Phase 2 with the exact Base references. This only submits a case; it does not invoke AI adjudication.
5. Someone separately pays to call `adjudicate`. Leader and validators independently fetch the bytes, compare digest and required facts, and evaluate with LLMs. Any unresolved authenticity, causation or contradictory evidence must be insufficient, not approved.
6. Case remains DECIDED and contestable for 3 days. One appeal replaces the public source/digest, increments revision and must be **mirrored** on Base by the insured wallet; the amended case requires another `adjudicate` transaction. The browser performs **Bradbury first** to protect the shorter appeal deadline and only then revises Base. A verified but unmatched leg is `APPEAL_SYNC_PENDING`, never a settlement. On retry, both on-chain revisions and evidence hashes are compared; the already-consumed leg is not repeated. The appeal retains the frozen evidence-issuer hostname and must introduce a different evidence digest.
7. After the fresh 3-day window, `finalize_case` seals the result; `get_decision_digest` now becomes available. The backend records `BRADBURY_FINALIZED`, **not** a settlement certificate. Negative findings may finalize without USDC transfer; `INSUFFICIENT_EVIDENCE` is **not** a settleable verdict.
8. **Each** attestor reads GenLayer final state and Base lock independently, verifies actual source issuer/provenance, examines exclusions and causation, computes deterministic class payout, then signs the exact EIP-712 Decision in its own isolated key custody. The signed deadline is the same 12-confirmed Base claim-resolution deadline on every independent preflight run; a moving wall-clock-derived deadline would produce incompatible signatures.
9. Anyone relays at least 3 sorted, valid signatures on Base. Base `settle` checks correct exact typed digest, source 4221, immutable adjudicator, evidence and revision, terms, beneficiary, deadline, amount bounds, replay and pool solvency. COVERED pays USDC; NOT_COVERED releases reserve without payment.
10. The indexer must reconcile Base and Bradbury final events, including reorg rollback. A UI status alone must never imply payment.

## 6. Settlement witness and typed data

The GenLayer finalized result digest is:

```text
SHA256(canonical UTF-8 JSON with recursively sorted keys of:
 case_id, policy_id, claim_id, terms_hash, risk_spec_hash, verdict, revision,
 evidence_hash, coverage_class, finalized_at)
```

Python and TypeScript share the field set and serialization rule. An independently verified GenLayer transaction hash and case decision ID are additional required fields in the EIP-712 decision.

The Base EIP-712 `Decision` covers:

```text
policyId, claimId, bradburyDecisionId, genlayerTxId,
evidenceDigest, resultDigest, termsHash, riskSpecHash, recipient, amount,
coverageClass, verdict, revision, finalizedAt, deadline,
sourceChainId, adjudicator
```

The domain is `name=COVRA`, `version=1`, **Base Sepolia 84532** and the exact deployed `CovraPools` address. Sorted distinct signer addresses prevent signature duplicates. The Base constructor records the dedicated evidence issuer wallet and rejects any overlap between that wallet, the deployer, the quote signer and the five attestors. There is no contract-managed signer private key.

## 7. Negative controls reviewers should run

- False policy ID; wrong beneficiary; unauthenticated or expired owner claim.
- Source digest bit changed, invalid JSON, missing class facts, owner-controlled source substituted for issuer, evidence changed after claim lock.
- Outage 29 minutes; only 1 probe; execution without a signed mandate; DeFi without independent incident or loss; interruption 119 minutes or speculative loss.
- LLM guesses covered event without objective facts, contradictory sources, private evidence not independently accessible.
- Appeal after 3 days, second appeal, old revision signatures, GenLayer decision not finalized, finalized digest mismatch.
- Wrong Bradbury chain, wrong Base chain, wrong adjudicator, wrong terms hash, wrong source receipt, duplicate signed attestor, only 2 signatures, malicious signer.
- Negative verdict with positive amount, covered verdict with zero amount, amount above computed rule or policy limit, repeated claim payout.
- User withdrawal attempting to consume reserved assets, claim abandoned beyond 45-day grace, operator pause and attestor rotation during in-flight claim.
- Account/key rotation, provider RPC outage, fee depletion, claim retry and Base reorg.

Unit tests exercise the five coverage predicates, exact insured-risk identity, issuer signatures, payout bounds, replay/chain/finality mutations and pricing. The CI quality gate installs Foundry and executes the Solidity scenarios; this must still pass on a real runner before a green CI claim can be made.

## 8. Security limits

- Approved hostname is not sufficient to establish issuer provenance, particularly on platforms hosting user-generated data.
- The COVRA API accepts private evidence but cannot submit it as consensus-grade public proof.
- Bradbury's browser endpoint must be public and **unkeyed**; never expose proprietary Conduit credentials through NEXT_PUBLIC values.
- A quote price derived from illustrative BPS must not be sold as a legally valid insurance premium.
- The contract caps each policy but does not prevent correlated losses across independently funded pools; reserve stress scenarios and risk models are needed.
- Deterministic payout checks in the sample preflight are not yet hard-coded into Base; authorized independent attestors are the intended enforcement layer and are a live trust assumption.

## 9. Independent issuer and attestor runbook

1. An approved evidence issuer retrieves the operator-selected public HTTPS source through the hosted operator workflow, validates the exact frozen exposure and signs canonical JSON using its separately held EIP-191 private key, then publishes the exact bytes at the frozen HTTPS hostname. The claimant locks SHA-256 of the actual published bytes on Base. A user-controlled file with a matching hash is not enough. Shared Vercel hosting is a known non-independence limitation. `SIMULATED_DEMO` envelopes exist only in isolated tests; the hosted route, settlement-grade verifier, attestor preflight and GenLayer adjudicator reject them.
2. Every attestor independently runs `npm run attestor:preflight -- <case-id> <finalization-tx-hash>`. This verifies Base claim lock, class, risk digest, signed issuer, final Bradbury decision and deterministic payout. It never signs.
3. After actual individual manual review of source authority, exclusions, causation and loss, each authorized operator uses an isolated `ATTESTOR_PRIVATE_KEY` and `ATTESTOR_MANUAL_APPROVAL` to run `npm run attestor:sign` with its own preflight JSON on stdin. The helper re-runs the live preflight before signing.
4. A coordinator verifies and sorts at least three independently produced records with `npm run attestor:aggregate`. Paste the resulting certificate into the claim UI to submit the Base transaction. A receipt and resulting state must be verified before reporting a payout.
5. If source or validator availability endangers a locked claim, three authorized attestors may sign a ClaimExtension through `npm run claim:extension -- sign` and aggregate via `npm run claim:extension -- aggregate`. Each extension adds at most 30 days, with a hard cap of 105 days after the original claim deadline, and is separate from a payment certificate.

No onchain contract verifies the EIP-191 issuer signature directly; independent settlement attestors do so before signing. The GenLayer validators check issuer envelope syntax, frozen identity, source hash and class facts. The 3-of-5 quorum is a documented trust assumption, not a trustless bridge.

## 10. External code and docs

- [GenLayer v0.6 SDK](https://docs.genlayer.com/api-references/genlayer-js)
- [GenLayer networks / Bradbury Phase 2](https://docs.genlayer.com/developers/networks)
- [Consensus v0.6 migration](https://docs.genlayer.com/developers/consensus-v06-migration)
- [Circle USDC testnet contracts](https://developers.circle.com/stablecoins/usdc-contract-addresses)

