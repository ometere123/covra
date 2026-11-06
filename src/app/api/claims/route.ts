import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { claimInputSchema } from "@/lib/quote";
import { walletSession } from "@/lib/auth";
import { authenticateAgent } from "@/lib/agent-auth";
import { database, hasDatabase } from "@/lib/db";
import { responseError, testnetGuard } from "@/lib/http";
import { z } from "zod";
import { claimIdFromUuid } from "@/lib/claim-protocol";
import { riskSpecSchema,riskSpecDigest } from "@/lib/risk-spec";
import { baseClient, configuredPoolAddress, poolsAbi } from "@/lib/chain";
import { canCancelUnanchoredClaim, sameClaimIntake } from "@/lib/claim-intake";

export async function GET(request: NextRequest) {
  const wallet = await walletSession();
  const agent = wallet ? null : await authenticateAgent(request, "claim:read");
  const owner = wallet || agent?.ownerWallet;
  if (!owner) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({
    source: "none",
    state: "DATABASE_UNAVAILABLE",
    items: [],
    message: "The reconciled claim index is not configured; no claim rows are available.",
  }, { headers: { "Cache-Control": "no-store" } });
  const rows = await database()`select * from claims where lower(claimant_wallet)=${owner.toLowerCase()}
    order by created_at desc limit 200`;
  return NextResponse.json({ source: "supabase_reconciled_index", state: "CONFIRMED", items: rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    testnetGuard();
    const signedIn = await walletSession();
    const agent = signedIn ? null : await authenticateAgent(request,"claim:issue");
    const owner = signedIn || agent?.ownerWallet;
    if (!owner) return NextResponse.json({ error: "Wallet session or scoped claim:issue agent credential required" }, { status: 401 });
    if (!hasDatabase()) throw new Error("Database not configured");
    const body = claimInputSchema.parse(await request.json());
    for (const url of body.evidenceUrls) {
      if (!url.startsWith("https://")) throw new Error("Evidence references must use HTTPS");
    }
    const idempotency = z.string().min(12).max(100).parse(request.headers.get("idempotency-key") || randomBytes(16).toString("hex"));
    const sql = database();
    const replay = await sql`select * from claims
      where lower(claimant_wallet)=${owner.toLowerCase()} and idempotency_key=${idempotency} limit 1`;
    if (replay.length && !sameClaimIntake(replay[0] as any,body))
      return NextResponse.json({error:"Idempotency key already belongs to a different or cancelled claim"},{status:409});
    if (replay.length) return NextResponse.json({
      claim: replay[0], onchainClaimId: claimIdFromUuid(String(replay[0].id),owner),
      evidenceDigest: replay[0].evidence_manifest_hash, idempotentReplay: true,
      settlementStatus: "NO_PAYOUT_AUTHORIZED",
    }, { status: 200 });
    const policies = await sql`select * from policies where lower(policy_id)=${body.policyId.toLowerCase()}
      and lower(owner_wallet)=${owner.toLowerCase()} limit 1`;
    if (!policies.length) return NextResponse.json({ error: "Policy not found or wallet not authorized" }, { status: 404 });
    const p = policies[0];
    const riskRecord = await sql`select risk_spec_json from policy_risk_specs
      where policy_id=${body.policyId} and risk_spec_hash=${String(p.risk_spec_hash)}
        and lower(owner_wallet)=${owner.toLowerCase()} limit 1`;
    if (!riskRecord.length) throw new Error("Missing immutable insured-risk definition for this policy");
    const insuredRisk=riskSpecSchema.parse(riskRecord[0].risk_spec_json);
    if (riskSpecDigest(insuredRisk).toLowerCase()!==String(p.risk_spec_hash).toLowerCase())
      throw new Error("Insured-risk hash inconsistent with indexed Base policy");
    for (const reference of body.evidenceUrls) {
      const parsedUrl=new URL(reference);
      if (parsedUrl.protocol!=="https:"||parsedUrl.hostname.toLowerCase()!==insuredRisk.evidenceIssuerHost||
          parsedUrl.username||parsedUrl.password||parsedUrl.port) throw new Error("Evidence must originate at the frozen issuer host");
    }
    if (Number(p.coverage_class) !== body.coverageClass) throw new Error("Coverage class mismatch");
    if (new Date(p.claim_deadline).getTime() < Date.now()) throw new Error("Policy claim deadline passed");
    if (new Date(body.incidentAt).getTime() < new Date(p.starts_at).getTime() ||
        new Date(body.incidentAt).getTime() > new Date(p.ends_at).getTime()) {
      throw new Error("Incident occurred outside coverage period");
    }
    if (BigInt(body.requestedMicroUsdc) > BigInt(String(p.cover_micro_usdc))) throw new Error("Claim exceeds policy limit");
    // A Base policy has exactly ONE claim lock for its entire lifetime. An
    // earlier denied or expired application cannot be silently replaced.
    const existing = await sql`select id from claims where lower(policy_id)=${body.policyId.toLowerCase()}
      and status <> 'CANCELLED' limit 1`;
    if (existing.length) return NextResponse.json({ error: "This policy already has a claim; use its appeal process" }, { status: 409 });

    const rows = await sql`
      insert into claims(
        policy_id,claimant_wallet,coverage_class,incident_at,description,evidence_urls,
        requested_micro_usdc,idempotency_key,status,evidence_manifest_hash
      ) values (
        ${body.policyId},${owner},${body.coverageClass},${body.incidentAt},
        ${body.description},${sql.json(body.evidenceUrls)},
        ${body.requestedMicroUsdc},${idempotency},'AWAITING_EVIDENCE',${body.evidenceCommitment?.toLowerCase() ?? null}
      ) on conflict do nothing
      returning id,status,policy_id,created_at
    `;
    if (!rows.length) {
      // Two identical concurrent requests may lose the ON CONFLICT race.
      // Return the winner only after checking ALL bound incident fields.
      const winner=await sql`select * from claims where lower(claimant_wallet)=${owner.toLowerCase()}
        and idempotency_key=${idempotency} limit 1`;
      if (winner.length && sameClaimIntake(winner[0] as any,body)) {
        const winnerOnchainClaimId=claimIdFromUuid(String(winner[0].id),owner);
        await sql`update claims set onchain_claim_id=coalesce(onchain_claim_id,${winnerOnchainClaimId}) where id=${winner[0].id}`;
        return NextResponse.json({claim:winner[0],
          onchainClaimId:winnerOnchainClaimId,
          evidenceDigest:winner[0].evidence_manifest_hash,idempotentReplay:true,
          settlementStatus:"NO_PAYOUT_AUTHORIZED"},{status:200});
      }
      return NextResponse.json({
        error:"A claim for this policy or key was reserved concurrently; inspect the existing intake",
      },{status:409});
    }
    await sql`insert into audit_events(actor_wallet,action,resource_id,payload_hash)
      values (${owner},'CLAIM_INTAKE',${String(rows[0].id)},
      ${createHash("sha256").update(JSON.stringify(body)).digest("hex")})`;
    const onchainClaimId=claimIdFromUuid(String(rows[0].id),owner);
    await sql`update claims set onchain_claim_id=${onchainClaimId} where id=${rows[0].id}`;
    return NextResponse.json({
      claim: rows[0],
      onchainClaimId,
      evidenceDigest: body.evidenceCommitment?.toLowerCase() ?? null,
      next: body.evidenceCommitment
        ? "Lock the timely claim on Base, then submit independently retrievable evidence to the Bradbury adjudicator."
        : "Give the claim ID to the approved evidence issuer. Resume the claim after the observation has been bound.",
      settlementStatus: "NO_PAYOUT_AUTHORIZED",
    }, { status: 201 });
  } catch (error) {
    return responseError(error);
  }
}

/** Only the insured owner can withdraw a draft that has NOT been locked on Base.
 * Agent credentials deliberately cannot delete or replace an owner's claim.
 */
export async function DELETE(request: NextRequest) {
  try {
    testnetGuard();
    const owner=await walletSession();
    if (!owner) return NextResponse.json({error:"Insured wallet session required"},{status:401});
    const body=z.object({
      claimId:z.string().uuid(),
      confirmedNoPendingBaseTransaction:z.literal(true),
    }).strict().parse(await request.json());
    const sql=database();
    const rows=await sql`select id,policy_id,status,base_lock_tx_hash,bradbury_tx_hash
      from claims where id=${body.claimId} and lower(claimant_wallet)=${owner.toLowerCase()} limit 1`;
    if (!rows.length) return NextResponse.json({error:"Claim not found"},{status:404});
    const claim=rows[0];
    if (!canCancelUnanchoredClaim(String(claim.status),claim.base_lock_tx_hash,claim.bradbury_tx_hash))
      return NextResponse.json({error:"Only an unanchored intake can be withdrawn; on-chain claims require the appeal or expiry process"},{status:409});
    const pool=configuredPoolAddress();
    if (!pool) throw new Error("Base pool contract not configured; cannot prove claim is unlocked");
    const lock=await baseClient.readContract({address:pool,abi:poolsAbi,
      functionName:"claimLockOf",args:[claim.policy_id as `0x${string}`]});
    if (lock[0]!==`0x${"0".repeat(64)}`)
      return NextResponse.json({error:"Base has already locked a claim for this policy"},{status:409});

    const cancelled=await sql`update claims set status='CANCELLED',cancelled_at=now(),updated_at=now()
      where id=${body.claimId} and lower(claimant_wallet)=${owner.toLowerCase()}
      and status in ('INTAKE','AWAITING_EVIDENCE') and base_lock_tx_hash is null
      and bradbury_tx_hash is null returning id`;
    if (!cancelled.length) return NextResponse.json({error:"Claim status changed during cancellation"},{status:409});
    await sql`insert into audit_events(actor_wallet,action,resource_id,payload_hash)
      values(${owner},'CLAIM_INTAKE_CANCELLED',${body.claimId},${createHash("sha256").update(body.claimId).digest("hex")})`;
    return NextResponse.json({cancelled:true,claimId:body.claimId,
      warning:"A pending Base transaction cannot be cancelled by this API. Revoke unwanted on-chain claim agents and verify no transaction is pending before opening another claim."});
  } catch (error) { return responseError(error); }
}
