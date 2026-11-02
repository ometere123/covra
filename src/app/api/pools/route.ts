import { NextResponse } from "next/server";
import { baseClient, configuredPoolAddress, poolsAbi } from "@/lib/chain";
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
    const items = await Promise.all(coverages.map(async risk => {
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
    }));
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
