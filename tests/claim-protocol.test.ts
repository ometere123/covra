import { describe, expect, it } from "vitest";
import { hashTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  APPEAL_WINDOW_SECONDS, BASE_SETTLEMENT_CHAIN, BRADBURY_SOURCE_CHAIN,
  canonicalJson, claimIdFromUuid, decisionTypes, evidenceEnvelope,
  finalizedResultDigest, sha256Digest, validateCoverageFacts, verifiedVerdictCode,
  computeCoveragePayout,
} from "../src/lib/claim-protocol";

const digest = ("0x" + "a".repeat(64)) as `0x${string}`;
const digest2 = ("0x" + "b".repeat(64)) as `0x${string}`;
const owner="0x1111111111111111111111111111111111111111";
const riskSpec=(risk:number)=>({coverageClass:risk,subject:["task-42","trusted-service","agent-alpha","vault-x","warehouse-billing"][risk],
  referenceHash:digest,statement:"The signed exposure is only the named objective incident.",
  evidenceIssuerHost:"issuer.example.org"});
const positiveFacts: Record<number, Record<string, unknown>> = {
  0: { missed_deadline: true, task_spec_hash: digest, contracted_penalty_micro_usdc: 3000000 },
  1: { provider_id: "trusted-service", outage_minutes: 30, independent_probes: 2 },
  2: { unauthorized_action: true, mandate_hash: digest, transaction_hash: digest2, verified_loss_micro_usdc: 4500000 },
  3: { incident_kind: "EXPLOIT", incident_tx_hash: digest, independent_observers: 2, verified_loss_micro_usdc: 6000000 },
  4: { baseline_hash: digest, interruption_minutes: 120, attributable_loss_micro_usdc: 100000 },
};

describe("canonical cross-chain evidence", () => {
  it("has a deterministic nested canonical JSON representation and raw-byte digest", () => {
    expect(canonicalJson({ z: [2, { b: 1, a: true }], a: "hello" }))
      .toBe('{"a":"hello","z":[2,{"a":true,"b":1}]}');
    expect(sha256Digest("abc"))
      .toBe("0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Digest("abc")).not.toBe(sha256Digest("abc\\n"));
  });

  it("binds the deterministic Base claim ID to the database UUID", () => {
    expect(claimIdFromUuid("f4831000-88cc-4cdc-a18b-0b39ddcf9490",owner))
      .toBe(claimIdFromUuid("f4831000-88cc-4cdc-a18b-0b39ddcf9490",owner));
    expect(claimIdFromUuid("f4831000-88cc-4cdc-a18b-0b39ddcf9490",owner))
      .not.toBe(claimIdFromUuid("f4831000-88cc-4cdc-a18b-0b39ddcf9491",owner));
    expect(claimIdFromUuid("f4831000-88cc-4cdc-a18b-0b39ddcf9490",owner))
      .not.toBe(claimIdFromUuid("f4831000-88cc-4cdc-a18b-0b39ddcf9490","0x2222222222222222222222222222222222222222"));
  });

  for (const risk of [0, 1, 2, 3, 4]) {
    it(`coverage class ${risk}: permits objective facts and rejects missing facts`, () => {
      const facts = positiveFacts[risk];
      expect(validateCoverageFacts(risk, facts)).toBe(true);
      const dropped = { ...facts };
      delete dropped[Object.keys(dropped)[0]];
      expect(validateCoverageFacts(risk, dropped)).toBe(false);
      expect(evidenceEnvelope.safeParse({
        schema: "covra-evidence",
        policy_id: digest, claim_id: digest2, terms_hash: digest,
        risk_spec_hash:digest,risk_spec:riskSpec(risk),
        issuer:{wallet:owner,signed_at:1793500000,expires_at:1793503600,signature:"0x"+"c".repeat(130)},
        coverage_class: risk, observation_id:`fixture-${risk}`, event_time: "2026-10-30T10:00:00Z",
        observed_at:"2026-10-30T10:01:00Z", observation_mode:"OBSERVED_PUBLIC",
        source_details:{issuer_host:"issuer.example.org",endpoint:`https://issuer.example.org/observations/fixture-${risk}`,
          retrieval_method:"https_get",source_payload_digest:digest,
          origin_url:`https://status.example.org/observations/fixture-${risk}`,origin_payload_digest:digest}, facts,
      }).success).toBe(true);
      expect(evidenceEnvelope.safeParse({
        schema: "covra-evidence", policy_id:digest,claim_id:digest2,
        terms_hash:digest,risk_spec_hash:digest,risk_spec:riskSpec(risk),
        issuer:{wallet:owner,signed_at:1793500000,expires_at:1793503600,signature:"0x"+"c".repeat(130)},
        coverage_class:risk,observation_id:`fixture-${risk}`,event_time:"2026-10-30T10:00:00+01:00",
        observed_at:"2026-10-30T10:01:00Z",observation_mode:"OBSERVED_PUBLIC",
        source_details:{issuer_host:"issuer.example.org",endpoint:`https://issuer.example.org/observations/fixture-${risk}`,
          retrieval_method:"https_get",source_payload_digest:digest,
          origin_url:`https://status.example.org/observations/fixture-${risk}`,origin_payload_digest:digest},facts,
      }).success).toBe(false);
    });
  }

  it("rejects malformed claims and the failure of numerical thresholds", () => {
    expect(validateCoverageFacts(1, { ...positiveFacts[1], outage_minutes: 29 })).toBe(false);
    expect(validateCoverageFacts(3, { ...positiveFacts[3], independent_observers: 1 })).toBe(false);
    expect(validateCoverageFacts(4, { ...positiveFacts[4], interruption_minutes: 119 })).toBe(false);
    expect(validateCoverageFacts(4, { ...positiveFacts[4], attributable_loss_micro_usdc: 0 })).toBe(false);
    expect(validateCoverageFacts(4, { ...positiveFacts[4], attributable_loss_micro_usdc: 1.5 })).toBe(false);
    expect(verifiedVerdictCode("NOT_COVERED")).toBe(2);
    expect(verifiedVerdictCode("COVERED")).toBe(1);
    expect(() => verifiedVerdictCode("INSUFFICIENT_EVIDENCE")).toThrow();
  });
  it("derives claim payout deterministically from facts and immutable limits", () => {
    expect(computeCoveragePayout(0,5000000n,positiveFacts[0])).toBe(3000000n);
    expect(computeCoveragePayout(1,8000000n,positiveFacts[1])).toBe(2000000n);
    expect(computeCoveragePayout(1,8000000n,{...positiveFacts[1],outage_minutes:60})).toBe(4000000n);
    expect(computeCoveragePayout(1,8000000n,{...positiveFacts[1],outage_minutes:120})).toBe(8000000n);
    expect(computeCoveragePayout(2,2000000n,positiveFacts[2])).toBe(2000000n);
    expect(computeCoveragePayout(3,2000000n,positiveFacts[3])).toBe(2000000n);
    expect(computeCoveragePayout(4,2000000n,positiveFacts[4])).toBe(100000n);
    expect(() => computeCoveragePayout(3,500000n,{...positiveFacts[3],verified_loss_micro_usdc:0})).toThrow();
  });

  it("makes finality and revision material to the result digest", () => {
    const original = {
      case_id: "case-a-valid-01", policy_id: digest, claim_id: digest2,
      terms_hash: digest, risk_spec_hash:digest, verdict: "COVERED" as const,
      revision: 0, evidence_hash: digest, coverage_class: 0, finalized_at: 1793500000,
    };
    expect(finalizedResultDigest(original)).not.toBe(
      finalizedResultDigest({ ...original, revision: 1 }),
    );
    expect(finalizedResultDigest(original)).not.toBe(
      finalizedResultDigest({ ...original, evidence_hash: digest2 }),
    );
    expect(finalizedResultDigest(original)).not.toBe(
      finalizedResultDigest({ ...original, verdict: "NOT_COVERED" }),
    );
  });

  it("signs exact EIP-712 fields with chain-specific domain; tampering changes the hash", () => {
    const account = privateKeyToAccount(("0x" + "1".repeat(64)) as `0x${string}`);
    const domain = {
      name: "COVRA", version: "1", chainId: BASE_SETTLEMENT_CHAIN,
      verifyingContract: "0x1111111111111111111111111111111111111111",
    } as const;
    const message = {
      policyId: digest, claimId: digest2, bradburyDecisionId: digest,
      genlayerTxId: digest2, evidenceDigest: digest, resultDigest: digest2,
      termsHash: digest, riskSpecHash:digest, recipient: account.address, amount: 2000000n,
      coverageClass: 1, verdict: 1, revision: 0,
      finalizedAt: 1793500000n, deadline: 1793500300n,
      sourceChainId: BigInt(BRADBURY_SOURCE_CHAIN),
      adjudicator: "0x2222222222222222222222222222222222222222",
    } as const;
    const data = { domain, types: decisionTypes, primaryType: "Decision", message } as const;
    expect(hashTypedData(data)).not.toBe(hashTypedData({
      ...data, message: { ...message, amount: 3000000n },
    }));
    expect(hashTypedData(data)).not.toBe(hashTypedData({
      ...data, message: { ...message, revision: 1 },
    }));
    expect(hashTypedData(data)).not.toBe(hashTypedData({
      ...data, domain: { ...domain, chainId: 4221 },
    }));
    expect(APPEAL_WINDOW_SECONDS).toBe(259200);
  });
});
