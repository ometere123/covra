import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { matchesBearerSecret } from "@/lib/bearer-secret";
import { decodeEventLog } from "viem";
import { baseClient, configuredPoolAddress, poolsAbi } from "@/lib/chain";
import { database } from "@/lib/db";
import { logRanges } from "@/lib/indexer-ranges";
import { indexerStream } from "@/lib/indexer-stream";
import { claimIdFromUuid } from "@/lib/claim-protocol";
import { processClaimFollowups } from "@/workflows/claim-followup";

const CONFIRMATIONS = 12n;
const MAX_RANGE = 2000n;

function serialized(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => typeof entry === "bigint" ? entry.toString() : entry);
}

function statusCode(error: unknown): number {
  return error && typeof error === "object" && "statusCode" in error
    ? Number((error as { statusCode?: number }).statusCode) || 503
    : 503;
}

function halted(message: string, status = 409): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = status;
  return error;
}

export async function POST(request: NextRequest) {
  if (!matchesBearerSecret(request.headers.get("authorization"), process.env.INDEXER_CRON_SECRET)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const contract = configuredPoolAddress();
  if (!contract || !process.env.DATABASE_URL || !process.env.BASE_DEPLOYMENT_START_BLOCK) {
    return NextResponse.json({ error: "Indexer requires database, deployed contract, and deployment block" }, { status: 503 });
  }
  const STREAM = indexerStream(contract);

  let body: { fromBlock?: string; maxBlocks?: number } = {};
  try {
    const raw = await request.text();
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed.fromBlock !== undefined && !/^\d+$/.test(String(parsed.fromBlock))) throw new Error("fromBlock must be a decimal block number");
      if (parsed.maxBlocks !== undefined && (!Number.isInteger(parsed.maxBlocks) || Number(parsed.maxBlocks) < 1 || Number(parsed.maxBlocks) > Number(MAX_RANGE))) {
        throw new Error("maxBlocks must be an integer from 1 to 2000");
      }
      body = { fromBlock: parsed.fromBlock === undefined ? undefined : String(parsed.fromBlock), maxBlocks: parsed.maxBlocks as number | undefined };
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request body" }, { status: 400 });
  }

  const sql = database();
  // Independent read-model jobs also recover while Base RPC is unavailable.
  const followups = await processClaimFollowups().catch(() => ({ error: "FOLLOWUP_QUEUE_UNAVAILABLE" }));
  const leaseId = randomUUID();
  let runId: string | undefined;
  let replayOnly = false;
  try {
    const lease = await sql`insert into indexer_leases(stream,lease_id,lease_until)
      values(${STREAM},${leaseId},now()+interval '4 minutes')
      on conflict(stream) do update set lease_id=excluded.lease_id,lease_until=excluded.lease_until,updated_at=now()
      where indexer_leases.lease_until < now() returning stream`;
    if (!lease.length) return NextResponse.json({ error: "Another indexer run currently holds the lifecycle lease" }, { status: 409 });
    const run = await sql`insert into indexer_runs(stream,replay_only) values(${STREAM},false) returning id`;
    const activeRunId = String(run[0].id);
    runId = activeRunId;

    const cursor = await sql`select last_block,last_block_hash from indexer_cursors where stream=${STREAM} limit 1`;
    const cursorBlock = cursor.length ? BigInt(String(cursor[0].last_block)) : null;
    if (cursorBlock !== null && cursor[0].last_block_hash) {
      const anchored = await baseClient.getBlock({ blockNumber: cursorBlock });
      if (!anchored.hash || anchored.hash.toLowerCase() !== String(cursor[0].last_block_hash).toLowerCase()) {
        throw halted("Base reorganization detected at the lifecycle cursor. Reconciliation and an operator-approved replay are required.");
      }
    }
    const requestedStart = body.fromBlock === undefined ? null : BigInt(body.fromBlock);
    const start = requestedStart ?? (cursorBlock === null ? BigInt(process.env.BASE_DEPLOYMENT_START_BLOCK) : cursorBlock + 1n);
    replayOnly = requestedStart !== null && cursorBlock !== null && requestedStart <= cursorBlock;
    const head = await baseClient.getBlockNumber();
    const latest = head > CONFIRMATIONS ? head - CONFIRMATIONS : 0n;
    if (start > latest) {
      await sql`update indexer_runs set finished_at=now(),success=true,from_block=${String(start)},indexed_events=0,replay_only=${replayOnly} where id=${runId}`;
      return NextResponse.json({ indexed: 0, caughtUp: true, confirmations: Number(CONFIRMATIONS), cursor: cursorBlock?.toString() ?? null, followups });
    }
    const configuredRange = BigInt(body.maxBlocks ?? Number(MAX_RANGE));
    const until = start + configuredRange - 1n > latest ? latest : start + configuredRange - 1n;
    const logs: Awaited<ReturnType<typeof baseClient.getLogs>> = [];
    for (const range of logRanges(start, until)) {
      const renewed = await sql`update indexer_leases set lease_until=now()+interval '4 minutes',updated_at=now()
        where stream=${STREAM} and lease_id=${leaseId} and lease_until>now() returning stream`;
      if (!renewed.length) throw halted("Indexer lease expired or ownership changed; retry from the durable cursor");
      logs.push(...await baseClient.getLogs({ address: contract, ...range }));
    }
    let indexed = 0;
    const blockTimestamps = new Map<string, string | null>();
    for (const item of logs) {
      if (item.transactionHash === null || item.blockNumber === null || item.logIndex === null || item.blockHash === null) {
        throw halted("RPC returned a pending log inside the confirmed backfill range");
      }
      const transactionHash = item.transactionHash.toLowerCase();
      const blockKey = String(item.blockNumber);
      let blockTimestamp = blockTimestamps.get(blockKey);
      if (blockTimestamp === undefined) {
        const block = await baseClient.getBlock({ blockNumber: item.blockNumber });
        blockTimestamp = block.timestamp === undefined ? null : new Date(Number(block.timestamp) * 1000).toISOString();
        blockTimestamps.set(blockKey, blockTimestamp);
      }
      let decoded: { eventName?: string; args?: unknown };
      try {
        decoded = decodeEventLog({ abi: poolsAbi, data: item.data, topics: item.topics }) as typeof decoded;
      } catch {
        continue;
      }
      const eventName = String(decoded.eventName || "");
      const args = (decoded.args || {}) as Record<string, any>;
      const policyId = args.policyId ? String(args.policyId).toLowerCase() : null;
      const onchainClaimId = args.claimId ? String(args.claimId).toLowerCase() : null;
      // The deduplication marker and every projection must commit together.
      // Otherwise a failed projection would be permanently skipped on retry.
      await sql.begin(async transaction => {
      const sql = transaction;
      const fenced = await sql`update indexer_leases set lease_until=now()+interval '4 minutes',updated_at=now()
        where stream=${STREAM} and lease_id=${leaseId} and lease_until>now() returning stream`;
      if (!fenced.length) throw halted("Indexer lease expired or ownership changed; refusing stale event writes");
      let claimRows: Array<{ id: string }> = [];
      if (onchainClaimId) {
        claimRows = await sql`select id from claims where lower(onchain_claim_id)=${onchainClaimId} limit 1` as Array<{ id: string }>;
      }
      if (!claimRows.length && policyId && onchainClaimId) {
        const candidates = await sql`select id,claimant_wallet from claims where lower(policy_id)=${policyId}
          and status not in ('CANCELLED','PAID','DENIED','EXPIRED') order by created_at asc limit 100`;
        claimRows = candidates.filter(candidate =>
          claimIdFromUuid(String(candidate.id), String(candidate.claimant_wallet)).toLowerCase() === onchainClaimId
        ).map(candidate => ({ id: String(candidate.id) }));
      }
      const claimId = claimRows.length ? claimRows[0].id : null;
      const payload = serialized(args);
      const inserted = await sql`insert into claim_chain_events(
        chain_id,tx_hash,log_index,claim_id,event_type,block_number,block_hash,block_timestamp,payload
      ) values(84532,${transactionHash},${Number(item.logIndex ?? 0)},${claimId},
        ${eventName},${String(item.blockNumber)},${item.blockHash},${blockTimestamp},${sql.json(JSON.parse(payload))})
        on conflict do nothing returning tx_hash`;
      if (!inserted.length) return;
      indexed += 1;

      if (eventName === "PolicyPurchased" && policyId && args.insured && args.beneficiary) {
        await sql`insert into policies(
          policy_id,owner_wallet,beneficiary_wallet,coverage_class,premium_micro_usdc,cover_micro_usdc,
          terms_hash,risk_spec_hash,starts_at,ends_at,claim_deadline,base_tx_hash,base_block,onchain_state
        ) values(
          ${policyId},${String(args.insured).toLowerCase()},${String(args.beneficiary).toLowerCase()},${Number(args.coverageClass)},
          ${String(args.premium)},${String(args.limit)},${String(args.termsHash).toLowerCase()},${String(args.riskSpecHash).toLowerCase()},
          ${new Date(Number(args.startsAt)*1000).toISOString()},${new Date(Number(args.endsAt)*1000).toISOString()},
          ${new Date(Number(args.claimDeadline)*1000).toISOString()},${transactionHash},${String(item.blockNumber)},1
        ) on conflict(policy_id) do update set
          owner_wallet=excluded.owner_wallet,beneficiary_wallet=excluded.beneficiary_wallet,
          coverage_class=excluded.coverage_class,premium_micro_usdc=excluded.premium_micro_usdc,
          cover_micro_usdc=excluded.cover_micro_usdc,terms_hash=excluded.terms_hash,risk_spec_hash=excluded.risk_spec_hash,
          starts_at=excluded.starts_at,ends_at=excluded.ends_at,claim_deadline=excluded.claim_deadline,
          base_tx_hash=excluded.base_tx_hash,base_block=excluded.base_block,
          onchain_state=case when policies.onchain_state in (2,3,4) then policies.onchain_state else 1 end,
          onchain_state_updated_at=now()`;
      }
      if (eventName === "PolicyExpired" && policyId) {
        await sql`update policies set onchain_state=3,onchain_state_updated_at=now() where lower(policy_id)=${policyId}`;
        await sql`update claims set status=case
          when status in ('INTAKE','AWAITING_EVIDENCE','SUBMITTED_BRADBURY','ADJUDICATING',
            'DECIDED','APPEAL_OPEN','APPEAL_SYNC_PENDING','BRADBURY_FINALIZED','SETTLEMENT_PENDING')
            then 'EXPIRED' else status end,
          updated_at=now() where lower(policy_id)=${policyId}`;
      }
      if (eventName === "ClaimLocked" && claimId && onchainClaimId) {
        await sql`update claims set onchain_claim_id=${onchainClaimId},
          base_lock_tx_hash=coalesce(base_lock_tx_hash,${transactionHash}),
          status=case when status in ('INTAKE','AWAITING_EVIDENCE') then 'AWAITING_EVIDENCE' else status end,
          updated_at=now() where id=${claimId}`;
      }
      if (eventName === "ClaimEvidenceRevised" && claimId && onchainClaimId) {
        await sql`update claims set onchain_claim_id=${onchainClaimId},evidence_manifest_hash=${String(args.evidenceDigest).toLowerCase()},
          evidence_revision=${Number(args.revision)},updated_at=now() where id=${claimId}`;
      }
      if (eventName === "ClaimResolutionExtended" && claimId && onchainClaimId) {
        await sql`update claims set claim_resolution_extended_until=${String(args.newDeadline)},updated_at=now() where id=${claimId}`;
      }
      if (eventName === "ClaimSettled" && claimId) {
        await sql`update claims set base_settlement_tx_hash=${transactionHash},
          status=case when status in ('CANCELLED','DENIED','EXPIRED') then status else 'PAID' end,updated_at=now() where id=${claimId}`;
        if (policyId) await sql`update policies set onchain_state=2,onchain_state_updated_at=now() where lower(policy_id)=${policyId}`;
      }
      if (eventName === "ClaimDenied" && claimId) {
        await sql`update claims set base_denial_tx_hash=${transactionHash},
          status=case when status in ('CANCELLED','PAID','EXPIRED') then status else 'DENIED' end,updated_at=now() where id=${claimId}`;
        if (policyId) await sql`update policies set onchain_state=4,onchain_state_updated_at=now() where lower(policy_id)=${policyId}`;
      }
      });
    }
    const anchor = await baseClient.getBlock({ blockNumber: until });
    if (!anchor.hash) throw new Error("Indexed block missing canonical hash");
    await sql.begin(async transaction => {
    const sql = transaction;
    const fenced = await sql`update indexer_leases set lease_until=now()+interval '4 minutes',updated_at=now()
      where stream=${STREAM} and lease_id=${leaseId} and lease_until>now() returning stream`;
    if (!fenced.length) throw halted("Indexer lease expired or ownership changed; refusing stale cursor writes");
    if (!replayOnly) {
      await sql`insert into indexer_cursors(stream,last_block,last_block_hash) values(${STREAM},${String(until)},${anchor.hash})
        on conflict(stream) do update set last_block=excluded.last_block,last_block_hash=excluded.last_block_hash,updated_at=now()`;
    }
    await sql`update indexer_runs set finished_at=now(),success=true,from_block=${String(start)},through_block=${String(until)},
      indexed_events=${indexed},replay_only=${replayOnly},metadata=${sql.json({logs:logs.length,latest:latest.toString()})} where id=${activeRunId}`;
    });
    return NextResponse.json({ indexed, scanned: logs.length, fromBlock: start.toString(), throughBlock: until.toString(),
      caughtUp: until === latest, replayOnly, confirmations: Number(CONFIRMATIONS), followups });
  } catch (error) {
    if (runId) await sql`update indexer_runs set finished_at=now(),success=false,error=${error instanceof Error ? error.message : "Indexer failure"},replay_only=${replayOnly} where id=${runId}`.catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Indexer query failed; cursor not intentionally advanced" }, { status: statusCode(error) });
  } finally {
    await sql`update indexer_leases set lease_until=now(),updated_at=now() where stream=${STREAM} and lease_id=${leaseId}`.catch(() => undefined);
  }
}
