import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { canonicalJson, claimIdFromUuid, sha256Digest } from "../src/lib/claim-protocol";
import { issuerMessage, verifyIssuerEvidence } from "../src/lib/evidence-issuer";
import { canonicalRiskSpec, matchesRiskSpec, riskSpecDigest, riskSpecSchema } from "../src/lib/risk-spec";

const hash = "0x" + "a".repeat(64);
const source = "https://issuer.example.org/cases/123.json";
const riskSpec = {
  coverageClass: 1,
  subject: "reliable-api",
  referenceHash: hash,
  statement: "This coverage applies only to the contracted api and agreed monitoring.",
  evidenceIssuerHost: "issuer.example.org",
};
const facts = {
  provider_id: "reliable-api",
  monitoring_method_hash: hash,
  outage_minutes: 72,
  independent_probes: 3,
};
const account = privateKeyToAccount(("0x" + "2".repeat(64)) as `0x${string}`);
const now = 1800000000;

async function signedEvidence() {
  const unsigned = {
    schema: "covra-evidence", policy_id:hash, claim_id:hash, terms_hash:hash,
    risk_spec_hash:riskSpecDigest(riskSpec), risk_spec:riskSpec,
    coverage_class:1, observation_id:"fixture-risk-1", event_time:"2026-10-30T12:00:00Z",
    observed_at:"2026-10-30T12:01:00Z", observation_mode:"OBSERVED_PUBLIC",
    source_details:{issuer_host:"issuer.example.org",endpoint:source,retrieval_method:"https_get",source_payload_digest:sha256Digest(canonicalJson(facts)),origin_url:"https://status.example.net/events/123.json",origin_payload_digest:sha256Digest("raw-source-response")}, facts,
    issuer:{wallet:account.address.toLowerCase(),signed_at:now-60,expires_at:now+3600,
      signature:"0x"+"0".repeat(130)},
  };
  const signature=await account.signMessage({message:issuerMessage(unsigned)});
  return {...unsigned,issuer:{...unsigned.issuer,signature}};
}

describe("frozen exposure and independent issuer provenance", () => {
  it("preserves a deterministic digest and rejects unapproved hosts", () => {
    expect(canonicalRiskSpec(riskSpec)).toContain('"subject":"reliable-api"');
    expect(riskSpecDigest(riskSpec)).toBe(sha256Digest(canonicalRiskSpec(riskSpec)));
    expect(riskSpecDigest({...riskSpec,subject:"another-api"})).not.toBe(riskSpecDigest(riskSpec));
    expect(riskSpecSchema.safeParse({...riskSpec,evidenceIssuerHost:"localhost"}).success).toBe(false);
    expect(riskSpecSchema.safeParse({...riskSpec,evidenceIssuerHost:"issuer.example.org.evil.test"}).success).toBe(true);
  });
  it("requires exact provider and frozen monitoring reference", () => {
    expect(matchesRiskSpec(1,facts,riskSpec)).toBe(true);
    expect(matchesRiskSpec(1,{...facts,provider_id:"uninsured-api"},riskSpec)).toBe(false);
    expect(matchesRiskSpec(1,{...facts,monitoring_method_hash:"0x"+"b".repeat(64)},riskSpec)).toBe(false);
  });
  it("accepts a valid approved issuer signature", async () => {
    const evidence=await signedEvidence();
    expect((await verifyIssuerEvidence(evidence,source,{"issuer.example.org":account.address},now)).claim_id).toBe(hash);
  });
  it("rejects simulated evidence from settlement-grade verification", async () => {
    const base=await signedEvidence();
    await expect(verifyIssuerEvidence({...base,observation_mode:"SIMULATED_DEMO" as never},source,
      {"issuer.example.org":account.address},now)).rejects.toThrow();
  });
  it("requires observed-public records to bind their external source", async () => {
    const base=await signedEvidence();
    const unsigned={...base,observation_mode:"OBSERVED_PUBLIC" as const,source_details:{
      ...base.source_details,retrieval_method:"https_get" as const,
      origin_url:"https://status.example.net/events/123.json",
      origin_payload_digest:sha256Digest("raw-source-response"),
    },issuer:{...base.issuer,signature:"0x"+"0".repeat(130)}};
    const signature=await account.signMessage({message:issuerMessage(unsigned)});
    const observed={...unsigned,issuer:{...unsigned.issuer,signature}};
    expect((await verifyIssuerEvidence(observed,source,{"issuer.example.org":account.address},now)).observation_mode).toBe("OBSERVED_PUBLIC");
    await expect(verifyIssuerEvidence({...observed,source_details:{...observed.source_details,origin_url:undefined}},source,{"issuer.example.org":account.address},now)).rejects.toThrow(/bind the fetched origin/);
  });
  it("rejects forged issuer identity and altered observations", async () => {
    const evidence=await signedEvidence();
    await expect(verifyIssuerEvidence(evidence,source,{"issuer.example.org":"0x"+"1".repeat(40)},now)).rejects.toThrow();
    await expect(verifyIssuerEvidence({...evidence,facts:{...facts,outage_minutes:999}},source,{"issuer.example.org":account.address},now)).rejects.toThrow();
  });
  it("rejects expired attestations, mismatching source host and altered insured risk", async () => {
    const evidence=await signedEvidence();
    await expect(verifyIssuerEvidence(evidence,source,{"issuer.example.org":account.address},now+3600)).rejects.toThrow();
    await expect(verifyIssuerEvidence(evidence,"https://evil.example.org/claim.json",{"evil.example.org":account.address},now)).rejects.toThrow();
    await expect(verifyIssuerEvidence({...evidence,risk_spec:{...riskSpec,subject:"other-api"}},source,{"issuer.example.org":account.address},now)).rejects.toThrow();
  });
  it("derives distinct claim identities for two owners using the same nonce", () => {
    const nonce="8cfa78d0-7001-4322-899b-2d53993ee5a2";
    expect(claimIdFromUuid(nonce,account.address)).not.toBe(claimIdFromUuid(nonce,"0x"+"1".repeat(40)));
  });
});
