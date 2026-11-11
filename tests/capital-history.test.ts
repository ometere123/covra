import { describe, expect, it } from "vitest";
import { formatMicroUsdc, normalizeCapitalHistoryRow } from "../src/lib/capital-history";

const tx = `0x${"a".repeat(64)}`;

describe("indexed capital history", () => {
  it("normalizes a confirmed deposit with its chain timestamp and explorer link", () => {
    const item = normalizeCapitalHistoryRow({
      chain_id: 84532, tx_hash: tx, log_index: 2, event_type: "CapitalDeposited", block_number: 55,
      block_timestamp: "2026-11-11T12:00:00.000Z", created_at: "2026-11-11T12:00:02.000Z",
      payload: { coverageClass: "1", underwriter: "0x1111111111111111111111111111111111111111", usdcAmount: "25000000", shares: "25000000" },
    });
    expect(item).toMatchObject({ eventType: "CapitalDeposited", className: "Dependency outage", usdcAmountMicroUsdc: "25000000", shares: "25000000", confirmation: "CONFIRMED", timestampSource: "chain" });
    expect(item?.explorerUrl).toBe(`https://sepolia.basescan.org/tx/${tx}`);
  });

  it("uses indexed time only for legacy rows without a block timestamp", () => {
    const item = normalizeCapitalHistoryRow({
      chain_id: 84532, tx_hash: tx, log_index: 0, event_type: "CapitalWithdrawn", block_number: 60,
      created_at: "2026-11-11T12:00:02.000Z", payload: { coverageClass: 0, usdcAmount: "1", shares: "2" },
    });
    expect(item?.timestampSource).toBe("indexed");
  });

  it("rejects malformed or unknown event rows instead of rendering activity", () => {
    expect(normalizeCapitalHistoryRow({ chain_id: 84532, tx_hash: tx, log_index: 0, event_type: "CapitalDeposited", created_at: "now", payload: { coverageClass: 99, usdcAmount: "1", shares: "1" } })).toBeNull();
  });

  it("formats integer micro-USDC without floating point rounding", () => {
    expect(formatMicroUsdc("1250000")).toBe("$1.25 USDC");
    expect(formatMicroUsdc("1")).toBe("$0.000001 USDC");
  });
});
