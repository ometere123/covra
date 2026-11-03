import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { baseClient, configuredPoolAddress, poolsAbi } from "@/lib/chain";
import { database } from "@/lib/db";
import { indexerStream } from "@/lib/indexer-stream";

function authorized(request: NextRequest): boolean {
  const expected = process.env.INDEXER_CRON_SECRET;
  const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const pool = configuredPoolAddress();
  if (!pool || !process.env.DATABASE_URL) return NextResponse.json({ error: "Reconciliation requires database and deployed pool" }, { status: 503 });
  const stream = indexerStream(pool);
  try {
    const sql = database();
    const head = await baseClient.getBlockNumber();
    const confirmedBlock = head > 12n ? head - 12n : 0n;
    const policies = await sql`select policy_id,onchain_state from policies order by created_at desc limit 100`;
    const claims = await sql`select id,policy_id,onchain_claim_id,status,evidence_manifest_hash,evidence_revision,
      base_lock_tx_hash,claim_resolution_extended_until
      from claims where onchain_claim_id is not null and base_lock_tx_hash is not null
      order by updated_at desc limit 100`;
    const mismatches: Array<Record<string, unknown>> = [];
    let policyChecks = 0;
    for (const local of policies) {
      const chain = await baseClient.readContract({ address: pool, abi: poolsAbi, functionName: "policies", args: [local.policy_id], blockNumber: confirmedBlock });
      policyChecks += 1;
      const chainState = Number(chain[3]);
      if (chainState !== Number(local.onchain_state)) mismatches.push({ type: "POLICY_STATE", policyId: local.policy_id, local: Number(local.onchain_state), chain: chainState });
    }
    let claimChecks = 0;
    for (const local of claims) {
      const lock = await baseClient.readContract({ address: pool, abi: poolsAbi, functionName: "claimLockOf", args: [local.policy_id], blockNumber: confirmedBlock });
      const used = await baseClient.readContract({ address: pool, abi: poolsAbi, functionName: "usedClaims", args: [local.onchain_claim_id], blockNumber: confirmedBlock });
      const boundPolicy = await baseClient.readContract({ address: pool, abi: poolsAbi, functionName: "claimPolicyOf", args: [local.onchain_claim_id], blockNumber: confirmedBlock });
      const resolutionDeadline = await baseClient.readContract({ address: pool, abi: poolsAbi, functionName: "claimResolutionDeadline", args: [local.policy_id], blockNumber: confirmedBlock });
      claimChecks += 1;
      const lockMatches = String(lock[0]).toLowerCase() === String(local.onchain_claim_id).toLowerCase() &&
        String(lock[1]).toLowerCase() === String(local.evidence_manifest_hash).toLowerCase() && Number(lock[3]) === Number(local.evidence_revision);
      if (String(boundPolicy).toLowerCase() !== String(local.policy_id).toLowerCase()) mismatches.push({ type: "CLAIM_BINDING", claimId: local.id, localPolicyId: local.policy_id, chainPolicyId: boundPolicy });
      if (!lockMatches && !used) mismatches.push({ type: "CLAIM_LOCK", claimId: local.id, localEvidence: local.evidence_manifest_hash, chainLock: lock });
      if (local.claim_resolution_extended_until !== null && local.claim_resolution_extended_until !== undefined &&
          String(resolutionDeadline) !== String(local.claim_resolution_extended_until)) {
        mismatches.push({ type: "CLAIM_RESOLUTION_DEADLINE", claimId: local.id,
          local: String(local.claim_resolution_extended_until), chain: String(resolutionDeadline) });
      }
      if (local.status === "PAID" && !used) mismatches.push({ type: "PAID_NOT_USED", claimId: local.id });
      if (local.status === "DENIED" && !used) mismatches.push({ type: "DENIED_NOT_USED", claimId: local.id });
    }
    const cursor = await sql`select stream,last_block,last_block_hash,updated_at from indexer_cursors where stream=${stream} limit 1`;
    const runs = await sql`select id,started_at,finished_at,success,from_block,through_block,indexed_events,error
      from indexer_runs where stream=${stream} order by started_at desc limit 10`;
    return NextResponse.json({
      network: "Base Sepolia", chainId: 84532, pool, head: head.toString(), confirmedBlock: confirmedBlock.toString(),
      policyChecks, claimChecks, mismatchCount: mismatches.length, mismatches, cursor: cursor[0] || null, recentRuns: runs,
      sourceOfTruth: "on-chain state at a 12-confirmed block; Supabase is an operational read model",
    });
  } catch {
    return NextResponse.json({ error: "Reconciliation read failed" }, { status: 503 });
  }
}
