import { describe, expect, it } from "vitest";
import { deployedDecisionDigest } from "../src/lib/deployed-decision-digest";

const hash = "0x" + "ab".repeat(32);
const v1 = {
  id: hash, policy_id: hash, claim_id: hash, terms_hash: hash, risk_spec_hash: hash,
  evidence_hash: hash, verdict: "INSUFFICIENT_EVIDENCE", revision: 0, risk: 1,
  finalized_at: 1700000000, state: "FINALIZED",
};
const v2 = {
  ...v1, decision_schema: "covra-decision-v2", confidence: 0,
  findings: [{ id: "source_support", status: "UNVERIFIED", evidence_refs: ["https://example.org/café"] }],
  evidence_refs: [], provenance: "UNKNOWN", exclusions: [], contradictions: [], uncertainty: [],
};

describe("deployed decision digest", () => {
  it("matches Python sorted UTF-8 JSON vectors for both deployments", () => {
    expect(deployedDecisionDigest("V1", v1)).toBe("0xdecf7dc9ec3a5f9cadc0f6d7e9cc75b74058638c57cca05468157d7e0dd271f7");
    expect(deployedDecisionDigest("V2", v2)).toBe("0x0473c105e6215afc605a296155c9cc2aed7ab883254ab46284a9f2bd6fbe7a39");
    expect(deployedDecisionDigest("V2", { ...v2, revision: 1 })).not.toBe(deployedDecisionDigest("V2", v2));
  });

  it("rejects version substitution, nonfinal cases and coerced numbers", () => {
    expect(() => deployedDecisionDigest("V1", v2)).toThrow();
    expect(() => deployedDecisionDigest("V2", v1)).toThrow();
    expect(() => deployedDecisionDigest("V3", v2)).toThrow();
    expect(() => deployedDecisionDigest("V2", { ...v2, state: "DECIDED" })).toThrow();
    expect(() => deployedDecisionDigest("V2", { ...v2, confidence: "0" })).toThrow();
  });
});
