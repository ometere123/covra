import { describe, expect, it } from "vitest";
import { calculateTestnetQuote, quoteRequestSchema, claimInputSchema } from "../src/lib/quote";
import { canonicalTermsHash } from "../src/lib/terms";
import { riskSpecDigest } from "../src/lib/risk-spec";

const payload = {
  coverageClass: 0, coverageUsd: 5000, durationDays: 30,
  insured: "0x1111111111111111111111111111111111111111",
  beneficiary: "0x2222222222222222222222222222222222222222",
  termsHash: canonicalTermsHash(0),
  riskSpec:{coverageClass:0,subject:"task-42",referenceHash:"0x"+"a".repeat(64),
    statement:"Deliver a reviewed report before 17:00 UTC on Friday.",evidenceIssuerHost:"issuer.example.org"},
};
describe("non-binding deterministic testnet pricing", () => {
  it("converts max cover precisely into 6-decimal USDC", () => {
    const price = calculateTestnetQuote(payload);
    expect(price.coverLimitMicroUsdc).toBe(5000000000n);
    expect(price.premiumMicroUsdc).toBeGreaterThanOrEqual(1000000n);
    expect(price.methodology).toBe("deterministic-testnet-rate");
  });
  it("is monotonic in duration and risk limit", () => {
    const base = calculateTestnetQuote(payload);
    expect(calculateTestnetQuote({ ...payload, durationDays: 60 }).premiumMicroUsdc)
      .toBeGreaterThan(base.premiumMicroUsdc);
    expect(calculateTestnetQuote({ ...payload, coverageUsd: 10000 }).premiumMicroUsdc)
      .toBeGreaterThan(base.premiumMicroUsdc);
  });
  it("enforces each risk class maximum duration", () => {
    expect(() => calculateTestnetQuote({ ...payload, coverageClass: 3, durationDays: 90 })).toThrow();
    expect(() => calculateTestnetQuote({ ...payload, coverageClass: 4, durationDays: 200 })).toThrow();
  });
  it("rejects quote requests outside configured bounds", () => {
    expect(quoteRequestSchema.safeParse({ ...payload, coverageUsd: 999999999 }).success).toBe(false);
    expect(quoteRequestSchema.safeParse({ ...payload, insured: "0xBAD" }).success).toBe(false);
    expect(quoteRequestSchema.safeParse({ ...payload, coverageClass: 5 }).success).toBe(false);
    expect(quoteRequestSchema.safeParse({ ...payload, durationDays: 0 }).success).toBe(false);
    expect(quoteRequestSchema.safeParse({ ...payload, riskSpec:{...payload.riskSpec,coverageClass:1} }).success).toBe(false);
    expect(riskSpecDigest(payload.riskSpec)).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it("rejects unsupported or unsubstantiated claim forms", () => {
    const claim = {
      policyId: "0x" + "a".repeat(64),
      coverageClass: 0,
      incidentAt: "2026-10-30T10:00:00.000Z",
      description: "x".repeat(120),
      evidenceUrls: ["https://evidence.example.org/receipt"],
      evidenceCommitment: "0x" + "b".repeat(64),
      requestedMicroUsdc: "10000000",
    };
    expect(claimInputSchema.safeParse(claim).success).toBe(true);
    expect(claimInputSchema.safeParse({ ...claim, evidenceUrls: undefined, evidenceCommitment: undefined }).success).toBe(true);
    expect(claimInputSchema.safeParse({ ...claim, evidenceCommitment: undefined }).success).toBe(false);
    expect(claimInputSchema.safeParse({ ...claim, evidenceUrls: [] }).success).toBe(false);
    expect(claimInputSchema.safeParse({ ...claim, evidenceCommitment: "0xBAD" }).success).toBe(false);
    expect(claimInputSchema.safeParse({ ...claim, description: "no detail" }).success).toBe(false);
    expect(claimInputSchema.safeParse({ ...claim, requestedMicroUsdc: "-1" }).success).toBe(false);
  });
});
