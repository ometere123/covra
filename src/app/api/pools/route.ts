import { NextResponse } from "next/server";
import { baseClient, configuredPoolAddress, poolsAbi } from "@/lib/chain";
import { configuredAdjudicator } from "@/lib/bradbury-client";
import { verifyPoolIdentity } from "@/lib/pool-contract-verification";
import { coverages } from "@/lib/catalog";

export async function GET() {
  const addr = configuredPoolAddress();
  if (!addr) {
    return NextResponse.json({
      source: "protocol_configuration",
      state: "AWAITING_DEPLOYMENT",
      items: [],
      message: "Base Sepolia pool contract is not configured; no pool balances are available.",
    }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const [chainId, bytecode, usdc, bradburyAdjudicator, sourceBradburyChainId, items] = await Promise.all([
      baseClient.getChainId(),
      baseClient.getBytecode({ address: addr }),
      baseClient.readContract({ address: addr, abi: poolsAbi, functionName: "usdc" }),
      baseClient.readContract({ address: addr, abi: poolsAbi, functionName: "bradburyAdjudicator" }),
      baseClient.readContract({ address: addr, abi: poolsAbi, functionName: "SOURCE_BRADBURY_CHAIN_ID" }),
      Promise.all(coverages.map(async risk => {
        const value = await baseClient.readContract({
          address: addr, abi: poolsAbi, functionName: "pool", args: [risk.id],
        });
        return {
          classId: risk.id, name: risk.name,
          assetsMicroUsdc: value.assets.toString(),
          reservedMicroUsdc: value.reserved.toString(),
          premiumsWrittenMicroUsdc: value.premiumsWritten.toString(),
          paidMicroUsdc: value.paid.toString(),
          totalShares: value.totalShares.toString(),
        };
      })),
    ]);
    const identity = verifyPoolIdentity({
      chainId, bytecode, usdc, bradburyAdjudicator, sourceBradburyChainId,
    }, configuredAdjudicator());
    if (!identity.ok) {
      return NextResponse.json({
        source: "base_sepolia_rpc", state: "SYNCHRONIZATION_ERROR", items: [], message: identity.reason,
      }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ source: "base_sepolia_rpc", state: "CONFIRMED", address: addr, items }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      source: "base_sepolia_rpc",
      state: "SYNCHRONIZATION_ERROR",
      items: [],
      error: "Unable to read live pool data from Base Sepolia. No sample balances substituted.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
