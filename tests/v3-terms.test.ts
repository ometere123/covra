import { describe, expect, it } from "vitest";
import { canonicalTermsHash } from "../src/lib/terms";
import { v3Payout, v3Terms, v3TermsHash } from "../src/lib/v3-terms";

describe("V3 testnet coverage terms", () => {
  it("commits to distinct V3 class terms without changing legacy hashes", () => {
    const classes = [0, 1, 2, 3, 4];
    expect(new Set(classes.map(v3TermsHash)).size).toBe(5);
    for (const coverageClass of classes) {
      expect(v3TermsHash(coverageClass)).not.toBe(canonicalTermsHash(coverageClass));
      expect(v3Terms(coverageClass)).toMatchObject({
        inceptionDelaySeconds: 900, cureSeconds: 604800, appealSeconds: 259200,
      });
    }
  });

  it.each([[1799, 0n], [1800, 25n], [3599, 25n], [3600, 50n], [7199, 50n], [7200, 101n]])(
    "applies the outage tiers at %i seconds with integer rounding",
    (seconds, payout) => expect(v3Payout(1, 101n, 0n, seconds)).toBe(payout),
  );

  it("caps verified losses and enforces the interruption duration", () => {
    for (const coverageClass of [0, 2, 3]) {
      expect(v3Payout(coverageClass, 100n, 101n, 0)).toBe(100n);
      expect(v3Payout(coverageClass, 100n, 21n, 0)).toBe(21n);
    }
    expect(v3Payout(4, 100n, 21n, 7199)).toBe(0n);
    expect(v3Payout(4, 100n, 21n, 7200)).toBe(21n);
    expect(() => v3Payout(4, 100n, -1n, 7200)).toThrow();
    expect(() => v3Terms(5)).toThrow();
  });
});
