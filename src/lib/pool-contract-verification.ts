import { BASE_CHAIN_ID, BASE_USDC, BRADBURY_CHAIN_ID } from "@/lib/chain";

export type PoolIdentityRead = {
  chainId: number;
  bytecode: string | undefined;
  usdc: string;
  bradburyAdjudicator: string;
  sourceBradburyChainId: bigint;
};

export function verifyPoolIdentity(
  read: PoolIdentityRead,
  configuredAdjudicator: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (read.chainId !== BASE_CHAIN_ID) {
    return { ok: false, reason: `Configured pool is on chain ${read.chainId}, not Base Sepolia ${BASE_CHAIN_ID}.` };
  }
  if (!read.bytecode || read.bytecode === "0x") {
    return { ok: false, reason: "Configured pool has no deployed bytecode on Base Sepolia." };
  }
  if (read.usdc.toLowerCase() !== BASE_USDC.toLowerCase()) {
    return { ok: false, reason: "Pool is not bound to the Circle Base Sepolia test USDC contract." };
  }
  if (read.sourceBradburyChainId !== BigInt(BRADBURY_CHAIN_ID)) {
    return { ok: false, reason: "Pool is not bound to Bradbury Phase 2 chain 4221." };
  }
  if (!configuredAdjudicator) {
    return { ok: false, reason: "Bradbury adjudicator configuration is unavailable; pool binding cannot be verified." };
  }
  if (read.bradburyAdjudicator.toLowerCase() !== configuredAdjudicator.toLowerCase()) {
    return { ok: false, reason: "Pool Bradbury adjudicator binding does not match the configured deployment." };
  }
  return { ok: true };
}
