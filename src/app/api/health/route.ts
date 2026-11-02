import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { configuredPoolAddress } from "@/lib/chain";

export async function GET() {
  return NextResponse.json({
    name: "COVRA",
    status: "available",
    mode: process.env.COVRA_ENV || "unconfigured",
    configured: {
      database: hasDatabase(),
      poolContract: Boolean(configuredPoolAddress()),
      quoteSigner: Boolean(process.env.QUOTE_SIGNER_PRIVATE_KEY),
      genlayerNode: Boolean(process.env.BRADBURY_NODE_RPC_URL),
      evidenceIssuer: Boolean(process.env.EVIDENCE_ISSUER_HOST && process.env.EVIDENCE_ISSUER_PRIVATE_KEY && process.env.EVIDENCE_ISSUER_ADMIN_TOKEN),
    },
    networks: { bradburyPhase2: 4221, baseSepolia: 84532 },
  }, { headers: { "Cache-Control": "no-store" } });
}
