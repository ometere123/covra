# Independent testnet attestor onboarding

This is a testnet operations package for COVRA's trusted five-member, 3-of-5 quorum. It is not a claim that distinct addresses are independent organizations. The current status remains:

`FUNCTIONAL_QUORUM_VERIFIED / OPERATOR_INDEPENDENCE_NOT_VERIFIED`

No current roster member is replaced by this document. Existing claims keep the roster version recorded in their Base claim lock.

## Volunteer responsibilities and eligibility

Each volunteer must:

1. Operate from a separate organization or individual custody arrangement and disclose any common employer, wallet operator or signing service.
2. Generate a fresh testnet signing key locally and retain the private key. COVRA receives only the checksummed public address.
3. Maintain access to an authenticated Bradbury Phase 2 node and an independent Base Sepolia read endpoint.
4. Read the frozen Base policy, claim lock, evidence digest, policy terms and risk specification before signing.
5. Independently retrieve the exact Bradbury transaction and finalized case revision, decision digest and execution result.
6. Refuse wrong-chain, wrong-adjudicator, wrong-policy, wrong-claim, stale-revision, changed-evidence, unfinalized, expired or replayed certificates.
7. Keep an availability and incident-recovery contact outside the signing process. A missing operator fails closed; it is never replaced ad hoc by the deployer, quote signer or evidence issuer.

## Key generation and address verification

Generate the key on a machine the volunteer controls, using a wallet or audited local tooling. Do not paste the private key into chat, a ticket, a hosted environment, COVRA, GitHub or Vercel. Send only the checksummed address through the onboarding channel.

The operator verifies the address by a read-only Base Sepolia call and a challenge signature. The challenge must bind the volunteer address, pool address, chain ID, roster version and an expiry; it must not authorize a settlement. The verifier checks recovered address equality and then checks the on-chain roster membership.

The deployed replacement path is intentionally delayed and preserves five members:

```text
scheduleAttestorReplacement(previousSigner, replacementSigner)
  -> wait ATTESTOR_CHANGE_DELAY (2 days)
executeAttestorReplacement()
```

Only the owner can schedule. The contract rejects the deployment authority, quote signer, evidence issuer, owner, pending owner, zero addresses, active members and previously used attestor addresses. The owner must record both receipts, the effective time, the old/new roster version and a fresh `attestorAt(0..4)` read. Never use the compatibility `scheduleAttestorChange`/`executeAttestorChange` surface; those methods intentionally revert.

For three volunteers, repeat the delayed replacement process one address at a time. Do not schedule the next replacement until the previous receipt and roster version have been reconciled. Existing claims remain bound to their original roster version even after rotation.

## Read-only preflight for a claim

Before any signature, each operator independently checks:

- Base Sepolia chain `84532`, pool address and Circle test USDC address.
- Bradbury Phase 2 chain `4221`, genesis and adjudicator address.
- `claimLockOf(policyId)`, `claimPolicyOf(claimId)`, policy terms and `attestorRosterVersion`.
- The exact `submit_case`, `adjudicate` and (if applicable) `appeal` / `finalize_case` receipts.
- Bradbury state `FINALIZED`, successful execution result and the current revision.
- `get_decision_digest(caseId)` recomputed from the case fields.
- Evidence bytes over HTTPS, raw-response digest, issuer identity, frozen subject and policy/claim binding.
- Full appeal window, evidence expiry, settlement deadline, beneficiary and requested amount.
- A read-only Base simulation of the exact `settle` calldata.

The existing read-only verifier is:

```text
npm run attestor:preflight -- <case-id> <finalization-tx-hash>
```

It produces a candidate result only. It never signs and never broadcasts settlement.

## Signing walkthrough

1. Receive the exact canonical settlement payload from the coordinator.
2. Compare every field to the independent preflight: chain, pool, policy, claim, adjudicator, GenLayer transaction, revision, evidence digest, result digest, beneficiary, amount, finalized timestamp and expiry.
3. Reject if the verdict is `INSUFFICIENT_EVIDENCE`, if the case is not a final `COVERED` or `NOT_COVERED` result, or if any field differs.
4. Sign once with the locally held key using the configured EIP-712 domain. Do not send the private key or seed phrase.
5. Return only the signature and public address. The coordinator sorts and verifies three unique registered signers before requesting the Base transaction.
6. Monitor the Base receipt and `ClaimSettled`/`ClaimDenied` event independently. A signature bundle or submitted transaction is not a completed payout.

Functional test signatures made from the current common-custody keys may validate the contract's cryptographic mechanics, but they must not be presented as independent volunteer approvals.

## Availability and recovery

Operators record their normal response window, a secondary contact and the safe procedure for a lost or unavailable key. No key export or emergency substitution is allowed. If a signer cannot complete independent preflight, the quorum stops and the claim remains pending or follows the protocol's denial/expiry path. Roster rotation requires a fresh volunteer key, the two-day delay and a new read-only preflight; it cannot retroactively change an existing claim's signer set.
