import { NextRequest, NextResponse } from "next/server";
import { matchesBearerSecret } from "@/lib/bearer-secret";
import { baseClient, configuredPoolAddress, poolsAbi } from "@/lib/chain";
import { database } from "@/lib/db";
import { indexerStream } from "@/lib/indexer-stream";

export async function GET(request: NextRequest) {
  if (!matchesBearerSecret(request.headers.get("authorization"), process.env.INDEXER_CRON_SECRET)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const configuredPool = configuredPoolAddress();
  if (!configuredPool || !process.env.DATABASE_URL) return NextResponse.json({ error: "Reconciliation requires database and deployed pool" }, { status: 503 });
  const pool = configuredPool;
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
    const policyStates = new Map<string, number>();
    async function policyState(policyId: `0x${string}`) {
      const key = policyId.toLowerCase();
      const cached = policyStates.get(key);
      if (cached !== undefined) return cached;
      const chain = await baseClient.readContract({ address: pool, abi: poolsAbi, functionName: "policies", args: [policyId], blockNumber: confirmedBlock });
      const state = Number(chain[3]);
      policyStates.set(key, state);
      return state;
    }
    let policyChecks = 0;
    for (const local of policies) {
      const chainState = await policyState(local.policy_id);
      policyChecks += 1;
      if (chainState !== Number(local.onchain_state)) mismatches.push({ type: "POLICY_STATE", policyId: local.policy_id, local: Number(local.onchain_state), chain: chainState });
    }
    let claimChecks = 0;
    for (const local of claims) {
      const [lock, used, boundPolicy, resolutionDeadline, chainState] = await Promise.all([
        baseClient.readContract({ address: pool, abi: poolsAbi, functionName: "claimLockOf", args: [local.policy_id], blockNumber: confirmedBlock }),
        baseClient.readContract({ address: pool, abi: poolsAbi, functionName: "usedClaims", args: [local.onchain_claim_id], blockNumber: confirmedBlock }),
        baseClient.readContract({ address: pool, abi: poolsAbi, functionName: "claimPolicyOf", args: [local.onchain_claim_id], blockNumber: confirmedBlock }),
        baseClient.readContract({ address: pool, abi: poolsAbi, functionName: "claimResolutionDeadline", args: [local.policy_id], blockNumber: confirmedBlock }),
        policyState(local.policy_id),
      ]);
      claimChecks += 1;
      const lockMatches = String(lock[0]).toLowerCase() === String(local.onchain_claim_id).toLowerCase() &&
        String(lock[1]).toLowerCase() === String(local.evidence_manifest_hash).toLowerCase() && Number(lock[3]) === Number(local.evidence_revision);
      if (String(boundPolicy).toLowerCase() !== String(local.policy_id).toLowerCase()) mismatches.push({ type: "CLAIM_BINDING", claimId: local.id, localPolicyId: local.policy_id, chainPolicyId: boundPolicy });
      if (!lockMatches) mismatches.push({ type: "CLAIM_LOCK", claimId: local.id, localEvidence: local.evidence_manifest_hash,
        chainLock: { claimId: lock[0], evidenceDigest: lock[1], openedAt: String(lock[2]), revision: lock[3], rosterVersion: String(lock[4]) } });
      if (local.claim_resolution_extended_until !== null && local.claim_resolution_extended_until !== undefined &&
          String(resolutionDeadline) !== String(local.claim_resolution_extended_until)) {
        mismatches.push({ type: "CLAIM_RESOLUTION_DEADLINE", claimId: local.id,
          local: String(local.claim_resolution_extended_until), chain: String(resolutionDeadline) });
      }
      const chainTerminal = chainState === 2 && used ? "PAID" : chainState === 4 && used ? "DENIED" : chainState === 3 && !used ? "EXPIRED" : null;
      const localTerminal = ["PAID", "DENIED", "EXPIRED", "CANCELLED"].includes(local.status) ? local.status : null;
      if (localTerminal !== chainTerminal || used !== (chainState === 2 || chainState === 4)) {
        mismatches.push({ type: "CLAIM_STATE", claimId: local.id, local: local.status, chain: chainTerminal, chainPolicyState: chainState, used });
      }
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
