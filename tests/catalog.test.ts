import { describe, expect, it } from "vitest";
import { coverages, coverageById } from "../src/lib/catalog";
import { canonicalTermsHash } from "../src/lib/terms";

describe("five separately parameterized coverage types", () => {
  it("has exactly five unique risk classes and identifiers", () => {
    expect(coverages).toHaveLength(5);
    expect(coverages.map((item) => item.id)).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(coverages.map((item) => item.slug)).size).toBe(5);
  });

  it.each(coverages)("requires evidence and exclusions for $name", (risk) => {
    expect(risk.exclusions.length).toBeGreaterThan(0);
    expect(risk.evidence.length).toBeGreaterThan(0);
    expect(risk.testRateBps).toBeGreaterThan(0);
    expect(risk.maxDurationDays).toBeGreaterThan(0);
    expect(coverageById(risk.id).slug).toBe(risk.slug);
  });

  it("rejects class indices outside the five ring-fenced pools", () => {
    expect(() => coverageById(-1)).toThrow();
    expect(() => coverageById(5)).toThrow();
    expect(() => coverageById(100)).toThrow();
  });

  it("produces deterministic, risk-specific Keccak policy terms hashes", () => {
    const hashes = coverages.map((risk) => canonicalTermsHash(risk.id));
    expect(new Set(hashes).size).toBe(5);
    for (const hash of hashes) expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(canonicalTermsHash(0)).toBe(hashes[0]);
  });
});
