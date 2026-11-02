import { NextResponse } from "next/server";
import { coverages } from "@/lib/catalog";
import { canonicalTermsHash } from "@/lib/terms";

export async function GET() {
  return NextResponse.json({
    network: { genlayer: 4221, settlement: 84532 },
    testnetOnly: true,
    coverages: coverages.map(risk => ({ ...risk, termsHash: canonicalTermsHash(risk.id) })),
  });
}
