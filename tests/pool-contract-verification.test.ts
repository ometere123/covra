import { describe, expect, it } from "vitest";
import { verifyPoolIdentity, type PoolIdentityRead } from "@/lib/pool-contract-verification";

const adjudicator = "0xaefc8672272392310a2ea102787e28bb1f34e1d3";
const validRead: PoolIdentityRead = {
  chainId: 84532,
  bytecode: "0x6000",
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  bradburyAdjudicator: adjudicator,
  sourceBradburyChainId: 4221n,
};

describe("pool deployment verification", () => {
  it("accepts the complete Base/Bradbury/USDC binding", () => {
    expect(verifyPoolIdentity(validRead, adjudicator)).toEqual({ ok: true });
  });

  it.each([
    ["wrong Base chain", { chainId: 1 }, "Base Sepolia"],
    ["missing bytecode", { bytecode: "0x" }, "no deployed bytecode"],
    ["wrong token", { usdc: "0x0000000000000000000000000000000000000001" }, "Circle"],
    ["wrong source chain", { sourceBradburyChainId: 61999n }, "chain 4221"],
    ["wrong adjudicator binding", { bradburyAdjudicator: "0x0000000000000000000000000000000000000002" }, "binding"],
  ])("rejects %s", (_label, mutation, expected) => {
    const result = verifyPoolIdentity({ ...validRead, ...mutation }, adjudicator);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(expected);
  });

  it("fails closed when the configured adjudicator is unavailable", () => {
    const result = verifyPoolIdentity(validRead, null);
    expect(result).toEqual({
      ok: false,
      reason: "Bradbury adjudicator configuration is unavailable; pool binding cannot be verified.",
    });
  });
});
