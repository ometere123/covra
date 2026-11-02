import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { isHex, bytesToHex } from "viem";
import { quoteRequestSchema, calculateTestnetQuote, assertDelegatedBeneficiary } from "@/lib/quote";
import { responseError, testnetGuard } from "@/lib/http";
import { walletSession } from "@/lib/auth";
import { authenticateAgent } from "@/lib/agent-auth";
import { baseClient, configuredPoolAddress, poolsAbi, quoteTypes } from "@/lib/chain";
import { canonicalTermsHash } from "@/lib/terms";
import { canonicalRiskSpec, riskSpecDigest } from "@/lib/risk-spec";
import { database, hasDatabase } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    testnetGuard();
    const parsed = quoteRequestSchema.parse(await request.json());
    const terms = canonicalTermsHash(parsed.coverageClass);
    if (parsed.termsHash.toLowerCase() !== terms.toLowerCase()) throw new Error("Policy terms version/hash mismatch");

    const calculation = calculateTestnetQuote(parsed);
    const owner = await walletSession();
    const agent = owner ? null : await authenticateAgent(request, "quote:issue");
    const signedFor = owner || agent?.ownerWallet;
    if (signedFor && signedFor.toLowerCase() !== parsed.insured.toLowerCase()) {
      return NextResponse.json({ error: "Insured address is not controlled by authenticated owner" }, { status: 403 });
    }
    // The owner may explicitly purchase a third-party beneficiary policy; a
    // scoped API credential cannot choose who receives the payout.
    if (agent) assertDelegatedBeneficiary(parsed.insured, parsed.beneficiary);

    const privateKey = process.env.QUOTE_SIGNER_PRIVATE_KEY;
    const contract = configuredPoolAddress();
    const approvedIssuers=(process.env.COVRA_APPROVED_ISSUER_HOSTS||"")
      .split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
    if (!privateKey || !contract || !signedFor || !hasDatabase()) {
      return NextResponse.json({
        mode: "preview", executable: false,
        reason: !signedFor ? "Sign in with your wallet or a scoped agent credential to receive an executable quote." :
          "Database, quote signer and Base Sepolia contracts are not yet configured.",
        coverageClass: parsed.coverageClass,
        premiumUsd: calculation.premiumUsd,
        coverageUsd: calculation.coverageUsd,
        durationDays: calculation.durationDays,
        methodology: calculation.methodology,
      });
    }
    if (!approvedIssuers.includes(parsed.riskSpec.evidenceIssuerHost))
      throw new Error("Insurer has not approved this independent evidence issuer for executable coverage");
    if (!isHex(privateKey, { strict: true }) || privateKey.length !== 66) throw new Error("Malformed quote signer key");
    const signer = privateKeyToAccount(privateKey as `0x${string}`);
    const onchainSigner = await baseClient.readContract({
      address: contract, abi: poolsAbi, functionName: "quoteSigner",
    });
    if (onchainSigner.toLowerCase() !== signer.address.toLowerCase()) {
      throw new Error("Configured signer is not the signer registered on the Base contract");
    }

    const now = Math.floor(Date.now() / 1000);
    // Leave enough time for USDC approval + wallet confirmation without a stale inception time.
    const startsAt = BigInt(now + 900);
    const endsAt = startsAt + BigInt(parsed.durationDays * 86400);
    const quote = {
      policyId: bytesToHex(randomBytes(32)),
      insured: parsed.insured as `0x${string}`,
      beneficiary: parsed.beneficiary as `0x${string}`,
      coverageClass: parsed.coverageClass,
      premium: calculation.premiumMicroUsdc,
      limit: calculation.coverLimitMicroUsdc,
      startsAt,
      endsAt,
      claimDeadline: endsAt + 14n * 86400n,
      termsHash: terms,
      riskSpecHash: riskSpecDigest(parsed.riskSpec),
      nonce: BigInt(bytesToHex(randomBytes(16))),
      quoteDeadline: BigInt(now + 600),
    };
    const sql = database();
    await sql`insert into policy_risk_specs(policy_id,owner_wallet,risk_spec_hash,risk_spec_json)
      values(${quote.policyId},${signedFor.toLowerCase()},${quote.riskSpecHash},
        ${canonicalRiskSpec(parsed.riskSpec)}::jsonb)`;
    const signature = await signer.signTypedData({
      domain: { name: "COVRA", version: "1", chainId: 84532, verifyingContract: contract },
      types: quoteTypes, primaryType: "Quote", message: quote,
    });
    return NextResponse.json({
      mode: "testnet-ready", executable: true,
      signature,
      premiumUsd: calculation.premiumUsd,
      coverageUsd: calculation.coverageUsd,
      quote: Object.fromEntries(Object.entries(quote).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])),
      insuredRisk: parsed.riskSpec,
      note: "Quoted price is a deterministic testnet protocol configuration, not regulated or actuarial insurance underwriting.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error);
  }
}
