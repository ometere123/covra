import { coverages } from "@/lib/catalog";

export type CapitalHistoryItem = {
  id: string;
  eventType: "CapitalDeposited" | "CapitalWithdrawn";
  title: string;
  classId: number;
  className: string;
  usdcAmountMicroUsdc: string;
  shares: string;
  timestamp: string;
  timestampSource: "chain" | "indexed";
  confirmation: "CONFIRMED";
  txHash: string;
  blockNumber: string | null;
  explorerUrl: string;
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function integer(value: unknown): string | null {
  const text = String(value ?? "");
  return /^\d+$/.test(text) ? text : null;
}

export function normalizeCapitalHistoryRow(row: Record<string, unknown>): CapitalHistoryItem | null {
  const payload = objectValue(row.payload);
  const eventType = row.event_type === "CapitalDeposited" || row.event_type === "CapitalWithdrawn" ? row.event_type : null;
  const txHash = String(row.tx_hash ?? "");
  const classId = Number(payload?.coverageClass);
  const className = coverages.find(item => item.id === classId)?.name;
  const amount = integer(payload?.usdcAmount);
  const shares = integer(payload?.shares);
  const timestamp = String(row.block_timestamp || row.created_at || "");
  if (!eventType || !/^0x[0-9a-fA-F]{64}$/.test(txHash) || !Number.isInteger(classId) || !className || !amount || !shares || !timestamp || Number.isNaN(Date.parse(timestamp))) return null;
  return {
    id: `${String(row.chain_id)}:${txHash.toLowerCase()}:${String(row.log_index)}`,
    eventType,
    title: eventType === "CapitalDeposited" ? "Capital deposited" : "Capital withdrawn",
    classId,
    className,
    usdcAmountMicroUsdc: amount,
    shares,
    timestamp,
    timestampSource: row.block_timestamp ? "chain" : "indexed",
    confirmation: "CONFIRMED",
    txHash: txHash.toLowerCase(),
    blockNumber: row.block_number === null || row.block_number === undefined ? null : String(row.block_number),
    explorerUrl: `https://sepolia.basescan.org/tx/${txHash}`,
  };
}

export function formatMicroUsdc(value: string): string {
  if (!/^\d+$/.test(value)) return "—";
  const integerPart = value.length > 6 ? value.slice(0, -6) : "0";
  const fractionPart = value.slice(-6).padStart(6, "0").replace(/0+$/, "");
  return `$${integerPart || "0"}${fractionPart ? `.${fractionPart}` : ""} USDC`;
}
