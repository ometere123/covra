/** Isolated cryptographic fixtures only: never persisted or served as real observations. */
import { expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { canonicalJson, sha256Digest, validateCoverageFacts } from "../src/lib/claim-protocol";
import { issuerMessage, verifyIssuerEvidence } from "../src/lib/evidence-issuer";
import { riskSpecDigest } from "../src/lib/risk-spec";
const issuer = privateKeyToAccount(("0x" + "12".repeat(32)) as `0x${string}`);
const digest = sha256Digest("TEST_ONLY_REFERENCE");
const now = Math.floor(Date.parse("2026-11-03T00:00:00Z") / 1000);
const source = "https://issuer.example.org/observations/test-only";
const facts = [
  { task_id: "test-subject", task_spec_hash: digest, missed_deadline: true, contracted_penalty_micro_usdc: 1 },
  { provider_id: "test-subject", monitoring_method_hash: digest, outage_minutes: 60, independent_probes: 2 },
  { agent_id: "test-subject", mandate_hash: digest, unauthorized_action: true, transaction_hash: digest, verified_loss_micro_usdc: 1 },
  { protocol_id: "test-subject", exposure_hash: digest, incident_kind: "EXPLOIT", incident_tx_hash: digest, independent_observers: 2, verified_loss_micro_usdc: 1 },
  { operation_id: "test-subject", baseline_hash: digest, interruption_minutes: 120, attributable_loss_micro_usdc: 1 },
];
async function observation(risk: number) {
  const spec = { coverageClass: risk, subject: "test-subject", referenceHash: digest,
    statement: "Isolated test data; never a real event or policy.", evidenceIssuerHost: "issuer.example.org" };
  const value = { schema: "covra-evidence", policy_id: digest, claim_id: digest, terms_hash: digest,
    risk_spec_hash: riskSpecDigest(spec), risk_spec: spec, coverage_class: risk, observation_id: "test-only-" + risk,
    event_time: "2026-11-02T00:00:00Z", observed_at: "2026-11-03T00:00:00Z", observation_mode: "OBSERVED_PUBLIC",
    source_details: { issuer_host: "issuer.example.org", endpoint: source, retrieval_method: "https_get",
      source_payload_digest: sha256Digest(canonicalJson(facts[risk])), origin_url: "https://source.example.org/test-only.json", origin_payload_digest: digest },
    facts: facts[risk], issuer: { wallet: issuer.address, signed_at: now - 1, expires_at: now + 3600, signature: "0x" + "0".repeat(130) } };
  value.issuer.signature = await issuer.signMessage({ message: issuerMessage(value) });
  return value;
}
it.each([0, 1, 2, 3, 4])("independently verifies class %s identity, canonical facts and signature", async risk => {
  const value = await observation(risk);
  expect(validateCoverageFacts(risk, value.facts)).toBe(true);
  expect((await verifyIssuerEvidence(value, source, { "issuer.example.org": issuer.address }, now)).coverage_class).toBe(risk);
});
it.each([0, 1, 2, 3, 4])("rejects class %s claim substitution, forged signature, stale and conflicting content", async risk => {
  const value = await observation(risk);
  const approved = { "issuer.example.org": issuer.address };
  await expect(verifyIssuerEvidence({ ...value, claim_id: sha256Digest("other claim") }, source, approved, now)).rejects.toThrow();
  await expect(verifyIssuerEvidence({ ...value, issuer: { ...value.issuer, signature: "0x" + "0".repeat(130) } }, source, approved, now)).rejects.toThrow();
  await expect(verifyIssuerEvidence(value, source, approved, now + 3600)).rejects.toThrow(/expired/);
  await expect(verifyIssuerEvidence({ ...value, facts: { ...value.facts, subject: "altered" } }, source, approved, now)).rejects.toThrow(/digest/);
});
