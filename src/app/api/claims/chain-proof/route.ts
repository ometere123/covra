/** Persist chain receipts only after independently reading the final chain state. */
import { NextRequest, NextResponse } from "next/server";
import { createClient, isSuccessful } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { decodeEventLog } from "viem";
import { z } from "zod";
import { walletSession } from "@/lib/auth";
import { authenticateAgent } from "@/lib/agent-auth";
import { database } from "@/lib/db";
import { baseClient, configuredPoolAddress, poolsAbi } from "@/lib/chain";
import { configuredAdjudicator } from "@/lib/bradbury-client";
import { canonicalJson, claimIdFromUuid, finalizedResultDigest } from "@/lib/claim-protocol";
import { assertExactBradburyReceipt } from "@/lib/bradbury-receipt";
import { assertBradburyNodeIdentity, readFinalizedBradburyView } from "@/lib/bradbury-final-state";
import { responseError, testnetGuard } from "@/lib/http";

const schema=z.object({
  claimId:z.string().uuid(),txHash:z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  evidenceDigest:z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  evidenceSource:z.string().url().optional(),
  phase:z.enum(["BASE_LOCKED","BASE_REVISED","BRADBURY_SUBMITTED","BRADBURY_DECIDED","BRADBURY_APPEALED","BRADBURY_FINALIZED","BASE_SETTLED"]),
}).strict();

export async function POST(request:NextRequest) {
  try {
    testnetGuard();
    const wallet=await walletSession();
    const agent=wallet?null:await authenticateAgent(request,"claim:issue");
    const owner=(wallet||agent?.ownerWallet)?.toLowerCase();
    if (!owner) return NextResponse.json({error:"Authorized owner or agent required"},{status:401});
    const {claimId,txHash,phase,evidenceDigest,evidenceSource}=schema.parse(await request.json());
    const sql=database();
    const rows=await sql`select c.*,p.risk_spec_hash,p.terms_hash,p.beneficiary_wallet,p.cover_micro_usdc,
      prs.risk_spec_json
      from claims c join policies p on p.policy_id=c.policy_id
      join policy_risk_specs prs on prs.policy_id=p.policy_id and prs.risk_spec_hash=p.risk_spec_hash
      where c.id=${claimId} and lower(c.claimant_wallet)=${owner} limit 1`;
    if (!rows.length) return NextResponse.json({error:"Claim not found"},{status:404});
    const claim=rows[0];
    if (claim.status === "CANCELLED")
      return NextResponse.json({error:"This intake was withdrawn; it cannot be used for subsequent chain actions"},{status:409});
    const actualId=claimIdFromUuid(claimId,owner);
    const pool=configuredPoolAddress();
    if (!pool) throw new Error("Base pool not configured");
    let status="";
    let eventType:string=phase;
    let blockNumber:string|null=null;
    let blockHash:string|null=null;
    let logIndex=0;
    let details:Record<string,unknown>={};

    if (phase.startsWith("BASE_")) {
      const receipt=await baseClient.getTransactionReceipt({hash:txHash as `0x${string}`});
      const head=await baseClient.getBlockNumber();
      if (receipt.status!=="success"||head<receipt.blockNumber+11n)
        throw new Error("Base receipt lacks 12 confirmations or failed");
      if (receipt.to?.toLowerCase()!==pool.toLowerCase()) throw new Error("Unrelated Base transaction");
      let found=false;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase()!==pool.toLowerCase()) continue;
        try {
          const event=decodeEventLog({abi:poolsAbi,data:log.data,topics:log.topics});
          const args=event.args as {policyId?:`0x${string}`;claimId?:`0x${string}`;
            evidenceDigest?:`0x${string}`;revision?:number;beneficiary?:`0x${string}`;amount?:bigint};
          if (args.policyId?.toLowerCase()!==String(claim.policy_id).toLowerCase()||
              args.claimId?.toLowerCase()!==actualId.toLowerCase()) continue;
          if (phase==="BASE_LOCKED"&&event.eventName==="ClaimLocked"&&
              args.evidenceDigest?.toLowerCase()===String(claim.evidence_manifest_hash).toLowerCase()) found=true;
          if (phase==="BASE_REVISED"&&event.eventName==="ClaimEvidenceRevised"&&evidenceDigest&&
              args.evidenceDigest?.toLowerCase()===evidenceDigest.toLowerCase()&&args.revision===1) found=true;
          if (phase==="BASE_SETTLED"&&event.eventName==="ClaimSettled") {
            if (args.beneficiary?.toLowerCase()!==String(claim.beneficiary_wallet).toLowerCase())
              throw new Error("Wrong onchain beneficiary");
            found=true;details={amountMicroUsdc:args.amount?.toString(),recipient:args.beneficiary};
            eventType="ClaimSettled";
          }
          if (phase==="BASE_SETTLED"&&event.eventName==="ClaimDenied") {
            found=true;eventType="ClaimDenied";
          }
          if (found) {logIndex=log.logIndex;break;}
        } catch (error) {
          if (error instanceof Error && error.message==="Wrong onchain beneficiary") throw error;
        }
      }
      if (!found) throw new Error("Required COVRA claim event absent from confirmed receipt");
      blockNumber=receipt.blockNumber.toString();blockHash=receipt.blockHash;
      if (phase==="BASE_LOCKED"||phase==="BASE_REVISED") {
        const lock=await baseClient.readContract({address:pool,abi:poolsAbi,functionName:"claimLockOf",args:[claim.policy_id],blockNumber:receipt.blockNumber});
        const expectedEvidence=phase==="BASE_REVISED"?evidenceDigest:String(claim.evidence_manifest_hash);
        if (!expectedEvidence||lock[0].toLowerCase()!==actualId.toLowerCase()||
            lock[1].toLowerCase()!==expectedEvidence.toLowerCase())
          throw new Error("Current Base claim lock differs from submitted evidence");
        if (phase==="BASE_REVISED" && claim.pending_appeal_digest &&
            String(claim.pending_appeal_digest).toLowerCase()!==expectedEvidence.toLowerCase())
          throw new Error("Base revision would conflict with the recorded Bradbury appeal");
        status=phase==="BASE_REVISED"?
          (claim.bradbury_appeal_tx_hash?"APPEAL_OPEN":"APPEAL_SYNC_PENDING"):
          "AWAITING_EVIDENCE";
      } else status=eventType==="ClaimSettled"?"PAID":"DENIED";
      if (phase === "BASE_SETTLED") {
        const [policy,used] = await Promise.all([
          baseClient.readContract({address:pool,abi:poolsAbi,functionName:"policies",args:[claim.policy_id],blockNumber:receipt.blockNumber}),
          baseClient.readContract({address:pool,abi:poolsAbi,functionName:"usedClaims",args:[actualId],blockNumber:receipt.blockNumber}),
        ]);
        if (Number(policy[3]) !== (eventType === "ClaimSettled" ? 2 : 4) || !used)
          throw new Error("Base settlement receipt does not match the terminal on-chain policy and claim state");
      }
    } else {
      const endpoint=process.env.BRADBURY_NODE_RPC_URL;
      const adjudicator=configuredAdjudicator();
      if (!endpoint?.startsWith("https://")||!adjudicator) throw new Error("Bradbury execution node not configured");
      await assertBradburyNodeIdentity(endpoint);
      const client=createClient({chain:testnetBradbury,endpoint});
      // The SDK's simplified receipt drops the decoded calldata map.
      const receipt=await client.waitForFinalization({hash:txHash as `0x${string}` & {length:66},fullTransaction:true});
      if (!isSuccessful(receipt)) throw new Error("GenLayer transaction did not finalize successfully");
      const expectedFunction: string|undefined=({
        BRADBURY_SUBMITTED:"submit_case",BRADBURY_DECIDED:"adjudicate",
        BRADBURY_APPEALED:"appeal",BRADBURY_FINALIZED:"finalize_case",
      } as Record<string,string>)[phase];
      if (!expectedFunction) throw new Error("Unsupported Bradbury operation");
      const riskSpec=typeof claim.risk_spec_json === "string" ? JSON.parse(claim.risk_spec_json) : claim.risk_spec_json;
      const evidenceUrls=Array.isArray(claim.evidence_urls) ? claim.evidence_urls : [];
      const evidenceUrl=String(evidenceUrls[0] || "");
      const requestedMicro=BigInt(String(claim.requested_micro_usdc));
      const limitMicro=BigInt(String(claim.cover_micro_usdc));
      const payoutBps=Number((requestedMicro*10000n+limitMicro-1n)/limitMicro);
      if (phase === "BRADBURY_APPEALED") {
        if (!evidenceSource) throw new Error("Bradbury appeal receipt requires the exact new evidence source URL");
        const appealUrl=new URL(evidenceSource);
        if (appealUrl.protocol!=="https:" || appealUrl.username || appealUrl.password || appealUrl.port ||
            appealUrl.hostname.toLowerCase()!==String(riskSpec.evidenceIssuerHost).toLowerCase())
          throw new Error("Appeal evidence source is not the frozen approved HTTPS host");
      }
      const expectedArgs: unknown[]=phase === "BRADBURY_SUBMITTED" ? [
        actualId,String(claim.policy_id),actualId,owner,claimId,Number(claim.coverage_class),
        String(claim.terms_hash),canonicalJson(riskSpec),String(claim.risk_spec_hash),
        evidenceUrl,String(claim.evidence_manifest_hash),new Date(claim.incident_at).toISOString(),payoutBps,
      ] : phase === "BRADBURY_APPEALED" ? [
        actualId,String(evidenceSource || claim.appeal_evidence_url || ""),
        String(evidenceDigest || claim.pending_appeal_digest || ""),
      ] : [actualId];
      assertExactBradburyReceipt({
        receipt,transactionHash:txHash,recipient:adjudicator,functionName:expectedFunction,args:expectedArgs,
      });
      const raw=await readFinalizedBradburyView(endpoint,adjudicator,"get_case",[actualId]);
      if (typeof raw!=="string"||!raw) throw new Error("GenLayer case not found");
      const record=JSON.parse(raw);
      // Bradbury may record the appeal before the separate Base revision.
      // Only its independently finalized appeal receipt can justify the
      // temporary divergence recorded as APPEAL_SYNC_PENDING.
      const newAppealBeforeBase=phase==="BRADBURY_APPEALED"&&
        Number(claim.evidence_revision)===0 && Number(record.revision)===1;
      if (newAppealBeforeBase && (!evidenceDigest||
          evidenceDigest.toLowerCase()===String(claim.evidence_manifest_hash).toLowerCase()))
        throw new Error("A Bradbury-first appeal requires its new evidence digest");
      const expectedEvidence=newAppealBeforeBase?evidenceDigest:String(claim.evidence_manifest_hash);
      const expectedRevision=newAppealBeforeBase?1:Number(claim.evidence_revision);
      if (String(record.id).toLowerCase()!==actualId.toLowerCase()||
          String(record.claim_id).toLowerCase()!==actualId.toLowerCase()||
          String(record.policy_id).toLowerCase()!==String(claim.policy_id).toLowerCase()||
          String(record.insured_wallet).toLowerCase()!==owner||
          String(record.terms_hash).toLowerCase()!==String(claim.terms_hash).toLowerCase()||
          String(record.risk_spec_hash).toLowerCase()!==String(claim.risk_spec_hash).toLowerCase()||
          String(record.evidence_hash).toLowerCase()!==expectedEvidence?.toLowerCase()||
          Number(record.revision)!==expectedRevision)
        throw new Error("GenLayer case mismatches frozen Base owner, claim or insured risk");
      const acceptable=phase==="BRADBURY_SUBMITTED"?["SUBMITTED","DECIDED","FINALIZED"]:
        phase==="BRADBURY_DECIDED"?["DECIDED","FINALIZED"]:
        phase==="BRADBURY_APPEALED"?["SUBMITTED","DECIDED","FINALIZED"]:["FINALIZED"];
      if (!acceptable.includes(record.state)) throw new Error("Unexpected GenLayer case state");
      if (phase === "BRADBURY_FINALIZED") {
        const expectedDecisionDigest=finalizedResultDigest({
          case_id:String(record.id),policy_id:String(record.policy_id),claim_id:String(record.claim_id),
          terms_hash:String(record.terms_hash),risk_spec_hash:String(record.risk_spec_hash),
          verdict:String(record.verdict) as "COVERED"|"NOT_COVERED"|"INSUFFICIENT_EVIDENCE",
          revision:Number(record.revision),evidence_hash:String(record.evidence_hash),
          coverage_class:Number(record.risk),finalized_at:Number(record.finalized_at),
        });
        const digest=await readFinalizedBradburyView(endpoint,adjudicator,"get_decision_digest",[actualId]);
        if (typeof digest!=="string"||digest.toLowerCase()!==expectedDecisionDigest.toLowerCase())
          throw new Error("Finalized GenLayer decision digest does not match the canonical case state");
      }
      // A finalized GenLayer verdict is NOT a 3-of-5 USDC settlement
      // certificate. Never label it certified before attestors sign.
      status=phase==="BRADBURY_SUBMITTED"?"SUBMITTED_BRADBURY":
        phase==="BRADBURY_DECIDED"?"DECIDED":phase==="BRADBURY_APPEALED"?
          (newAppealBeforeBase?"APPEAL_SYNC_PENDING":"APPEAL_OPEN"):"BRADBURY_FINALIZED";
      details={state:record.state,verdict:record.verdict,revision:record.revision};
    }

    await sql`insert into claim_chain_events(chain_id,tx_hash,log_index,claim_id,event_type,block_number,block_hash,payload)
      values(${phase.startsWith("BASE")?84532:4221},${txHash.toLowerCase()},${logIndex},${claimId},
        ${eventType},${blockNumber},${blockHash},${sql.json(JSON.parse(JSON.stringify(details)))}) on conflict do nothing`;
    if (phase==="BASE_LOCKED") await sql`update claims set base_lock_tx_hash=${txHash},updated_at=now() where id=${claimId}`;
    if (phase==="BASE_REVISED") await sql`update claims set evidence_manifest_hash=${evidenceDigest!},
      evidence_revision=1,pending_appeal_digest=null,
      status=case when status in ('PAID','DENIED','EXPIRED','BRADBURY_FINALIZED','SETTLEMENT_PENDING')
          then status when bradbury_appeal_tx_hash is not null then 'APPEAL_OPEN'
          else 'APPEAL_SYNC_PENDING' end,
      updated_at=now() where id=${claimId}`;
    if (phase==="BRADBURY_SUBMITTED") await sql`update claims set bradbury_case_id=${actualId},bradbury_tx_hash=${txHash},
      status=case when status='AWAITING_EVIDENCE' then ${status} else status end,updated_at=now() where id=${claimId}`;
    if (phase==="BRADBURY_DECIDED") await sql`update claims set bradbury_decision_tx_hash=${txHash},
      status=case when status in ('SUBMITTED_BRADBURY','ADJUDICATING','APPEAL_OPEN') then ${status} else status end,
      updated_at=now() where id=${claimId}`;
    // Receipt replays must never roll a paid, denied or finalized claim back
    // into an appealable state. History remains in claim_chain_events.
    if (phase==="BRADBURY_APPEALED") await sql`update claims set
      bradbury_appeal_tx_hash=coalesce(bradbury_appeal_tx_hash,${txHash}),
      appeal_evidence_url=coalesce(appeal_evidence_url,${evidenceSource || null}),
      pending_appeal_digest=case
        when status in ('PAID','DENIED','EXPIRED','BRADBURY_FINALIZED','SETTLEMENT_PENDING')
          then pending_appeal_digest
        when evidence_revision=0 then ${evidenceDigest!} else null end,
      status=case when status in ('PAID','DENIED','EXPIRED','BRADBURY_FINALIZED','SETTLEMENT_PENDING')
          then status when evidence_revision=0 then 'APPEAL_SYNC_PENDING'
          else 'APPEAL_OPEN' end,updated_at=now() where id=${claimId}`;
    if (phase==="BRADBURY_FINALIZED") await sql`update claims set bradbury_finalization_tx_hash=${txHash},
      status=case when status in ('DECIDED','APPEAL_OPEN','SUBMITTED_BRADBURY') then ${status} else status end,
      updated_at=now() where id=${claimId}`;
    if (phase==="BASE_SETTLED") await sql`update claims set base_settlement_tx_hash=${txHash},status=${status},updated_at=now() where id=${claimId}`;
    return NextResponse.json({verified:true,phase,status,details});
  } catch(error) { return responseError(error); }
}
