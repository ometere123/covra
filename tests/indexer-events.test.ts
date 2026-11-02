import { describe, expect, it } from "vitest";
import { poolsAbi } from "@/lib/chain";

describe("Base lifecycle index ABI", () => {
  it("contains every emitted CovraPools lifecycle event", () => {
    const expected = [
      "CapitalDeposited", "CapitalWithdrawn", "PoolRecapitalized",
      "AgentAuthorized", "AgentRevoked", "ClaimAgentAuthorized",
      "PolicyPurchased", "PolicyExpired", "ClaimLocked", "ClaimEvidenceRevised",
      "ClaimResolutionExtended", "ClaimDenied", "ClaimSettled", "QuoteSignerChanged",
      "PausedStateChanged", "AttestorChangeScheduled", "AttestorChanged",
      "AttestorReplacementScheduled", "AttestorRosterVersionChanged",
      "OwnershipTransferStarted", "OwnershipTransferred",
    ] as const;
    const actual = new Set(poolsAbi.filter(item => item.type === "event").map(item => item.name));
    expect(expected.every(name => actual.has(name))).toBe(true);
  });
});
