import { describe, expect, it } from "vitest";
import {
  calculateWithdrawalMetrics,
  formatUsdcInput,
  parseUsdcAmount,
  quoteWithdrawal,
  withdrawalErrorMessage,
  type PoolWithdrawalPosition,
} from "../src/lib/pool-withdrawal";

const oneUsdc = 1_000_000n;

function position(overrides: Partial<PoolWithdrawalPosition> = {}): PoolWithdrawalPosition {
  return {
    assets: 1_000_000n,
    reserved: 0n,
    availableCapital: 1_000_000n,
    totalShares: 1_000_000n,
    ownedShares: 500_000n,
    ...overrides,
  };
}

describe("pool withdrawal precision and safety", () => {
  it("parses only bounded six-decimal USDC amounts", () => {
    expect(parseUsdcAmount("12.345678")).toBe(12_345_678n);
    expect(parseUsdcAmount("12.3456789")).toBeNull();
    expect(parseUsdcAmount("-1")).toBeNull();
    expect(parseUsdcAmount("1e3")).toBeNull();
    expect(formatUsdcInput(12_000_000n)).toBe("12");
    expect(formatUsdcInput(12_345_678n)).toBe("12.345678");
  });

  it("reports zero shares as non-withdrawable", () => {
    const result = quoteWithdrawal(position({ ownedShares: 0n }), oneUsdc);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not own shares/i);
    expect(calculateWithdrawalMetrics(position({ ownedShares: 0n })).maxWithdrawableAmount).toBe(0n);
  });

  it("quotes a partial withdrawal in USDC and converts it to shares", () => {
    const result = quoteWithdrawal(position(), 250_000n);
    expect(result.ok).toBe(true);
    expect(result.shares).toBe(250_000n);
    expect(result.redemptionAmount).toBe(250_000n);
  });

  it("supports a full value withdrawal without exceeding owned shares", () => {
    const result = quoteWithdrawal(position(), 500_000n);
    expect(result.ok).toBe(true);
    expect(result.shares).toBe(500_000n);
    expect(result.redemptionAmount).toBe(500_000n);
  });

  it("caps withdrawals at unreserved capital and explains the reserve limit", () => {
    const limited = position({ reserved: 600_000n, availableCapital: 400_000n });
    const metrics = calculateWithdrawalMetrics(limited);
    expect(metrics.reserveLimited).toBe(true);
    expect(metrics.maxWithdrawableAmount).toBe(400_000n);
    expect(quoteWithdrawal(limited, 400_000n).ok).toBe(true);
    expect(quoteWithdrawal(limited, 400_001n).error).toMatch(/maximum withdrawable/i);
  });

  it("rounds required shares up while keeping the payout inside the reserve boundary", () => {
    const fractional = position({ assets: 100n, totalShares: 3n, ownedShares: 3n, availableCapital: 100n });
    const result = quoteWithdrawal(fractional, 34n);
    expect(result.ok).toBe(true);
    expect(result.shares).toBe(2n);
    expect(result.redemptionAmount).toBe(66n);
    expect(result.redemptionAmount).toBeGreaterThanOrEqual(34n);
  });

  it("rejects a pool with no available liquidity", () => {
    const result = quoteWithdrawal(position({ availableCapital: 0n, reserved: 1_000_000n }), oneUsdc);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/available/i);
  });

  it("distinguishes a wallet rejection from an on-chain transaction failure", () => {
    expect(withdrawalErrorMessage(new Error("User rejected the request"))).toMatch(/cancelled in wallet/i);
    expect(withdrawalErrorMessage(new Error("Withdrawal reverted; active reserves may have changed."))).toMatch(/reverted/i);
  });
});
