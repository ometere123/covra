/**
 * COVRA independent verifier preflight. READ ONLY. NEVER SIGNS.
 * Run with: node --env-file=.env.local scripts/attestor-preflight.mjs <case-id> <finalization-tx-hash>
 *
 * Each of the five independently owned attestors must use its own authenticated
 * Phase 2 node/provider, compare with an independent Base node, and verify the
 * evidence issuer. This script fails closed on mismatches and only reports
 * candidate amount; it is NOT a settlement certificate or an oracle network.
 */
import { createHash } from "node:crypto";
import { createClient, isSuccessful } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionHashVariant } from "genlayer-js/types";
import { createPublicClient, http, parseAbi, recoverMessageAddress } from "viem";
import { baseSepolia } from "viem/chains";
import { assertIncidentWithinPolicy } from "./claim-window.mjs";
import { encodePreflightOutput } from "./preflight-io.mjs";
import { assertExactBradburyReceipt } from "./bradbury-receipt.mjs";

function fail(reason) { throw new Error("ATTESTOR_PREFLIGHT_REJECTED: " + reason); }
function hex32(value) { return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value); }
function address(value) { return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value); }
function same(a,b) { return String(a).toLowerCase() === String(b).toLowerCase(); }
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}
function sha256(bytes) { return "0x" + createHash("sha256").update(bytes).digest("hex"); }
async function readBounded(response, maximum) {
  if (Number(response.headers.get("content-length") || 0) > maximum) fail("issuer response exceeds evidence limit");
  if (!response.body) fail("issuer returned no response body");
  const reader=response.body.getReader();
  const chunks=[];
  let size=0;
  try {
    for (;;) {
      const {done,value}=await reader.read();
      if (done) break;
      size+=value.length;
      if (size>maximum) fail("issuer streamed oversized evidence");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(()=>undefined); }
  const bytes=new Uint8Array(size);
  let offset=0;
  for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
  return bytes;
}
function validFacts(risk, facts, spec) {
  const int = value => Number.isSafeInteger(value);
  const money = value => int(value) && value > 0;
  if (!facts || typeof facts !== "object") return false;
  const bound={
    0:["task_id","task_spec_hash"],1:["provider_id","monitoring_method_hash"],
    2:["agent_id","mandate_hash"],3:["protocol_id","exposure_hash"],
    4:["operation_id","baseline_hash"],
  }[risk];
  if (!bound || !spec || spec.coverageClass!==risk ||
      facts[bound[0]]!==spec.subject || !same(facts[bound[1]],spec.referenceHash)) return false;
  if (risk === 0) return facts.missed_deadline === true && hex32(facts.task_spec_hash) && money(facts.contracted_penalty_micro_usdc);
  if (risk === 1) return typeof facts.provider_id === "string" && facts.provider_id.length > 2
    && int(facts.outage_minutes) && facts.outage_minutes >= 30
    && int(facts.independent_probes) && facts.independent_probes >= 2;
  if (risk === 2) return facts.unauthorized_action === true && hex32(facts.mandate_hash)
    && hex32(facts.transaction_hash) && money(facts.verified_loss_micro_usdc);
  if (risk === 3) return ["EXPLOIT","BRIDGE_COMPROMISE","DEPEG"].includes(facts.incident_kind)
    && hex32(facts.incident_tx_hash) && int(facts.independent_observers)
    && facts.independent_observers >= 2 && money(facts.verified_loss_micro_usdc);
  if (risk === 4) return hex32(facts.baseline_hash) && int(facts.interruption_minutes)
    && facts.interruption_minutes >= 120 && money(facts.attributable_loss_micro_usdc);
  return false;
}
function cappedPayout(risk, limit, facts, spec) {
  if (!validFacts(risk,facts,spec) || limit <= 0n) fail("missing or invalid coverage-specific facts");
  if (risk === 1) return limit * (facts.outage_minutes >= 120 ? 100n : facts.outage_minutes >= 60 ? 50n : 25n) / 100n;
  const field = risk === 0 ? "contracted_penalty_micro_usdc" :
    risk === 4 ? "attributable_loss_micro_usdc" : "verified_loss_micro_usdc";
  const amount = BigInt(facts[field]);
  return amount > limit ? limit : amount;
}
const policyAbi = parseAbi([
  "function policies(bytes32 policyId) view returns (address insured,address beneficiary,uint8 coverageClass,uint8 state,uint96 limit,uint64 startsAt,uint64 endsAt,uint64 claimDeadline,bytes32 termsHash,bytes32 riskSpecHash)",
  "function claimLockOf(bytes32 policyId) view returns (bytes32 claimId,bytes32 evidenceDigest,uint64 openedAt,uint8 revision,uint256 attestorRosterVersion)",
  "function claimResolutionDeadline(bytes32 policyId) view returns (uint256)",
  "function bradburyAdjudicator() view returns (address)",
  "function evidenceIssuer() view returns (address)",
]);

async function main() {
  const caseId=process.argv[2];
  const finalizationTx=process.argv[3];
  const nodeUrl=process.env.BRADBURY_NODE_RPC_URL;
  const basePool=process.env.NEXT_PUBLIC_COVRA_POOLS_ADDRESS;
  const adjudicator=process.env.BRADBURY_ADJUDICATOR_ADDRESS;
  const evidenceIssuer=process.env.EVIDENCE_ISSUER_WALLET;
  if (!hex32(caseId)) fail("argument must be an exact bytes32 case ID");
  if (!hex32(finalizationTx)) fail("provide the actual finalized GenLayer transaction hash as second argument");
  if (!nodeUrl || !nodeUrl.startsWith("https://")) fail("missing full GenLayer BRADBURY_NODE_RPC_URL");
  if (!address(basePool) || !address(adjudicator) || !address(evidenceIssuer)) fail("missing Base/Bradbury/evidence-issuer addresses");
  const gen=createClient({chain:testnetBradbury,endpoint:nodeUrl});
  const finalReceipt=await gen.waitForFinalization({hash:finalizationTx,fullTransaction:true});
  if (!isSuccessful(finalReceipt)) fail("claimed GenLayer finalization receipt is not successful");
  try {
    assertExactBradburyReceipt({receipt:finalReceipt,transactionHash:finalizationTx,
      recipient:adjudicator,functionName:"finalize_case",args:[caseId]});
  } catch (error) {
    fail("GenLayer transaction is not an exact finalized finalization call: "+String(error?.message||error));
  }
  const raw=await gen.readContract({
    address:adjudicator,functionName:"get_case",args:[caseId],
    transactionHashVariant:TransactionHashVariant.LATEST_FINAL,
  });
  if (typeof raw !== "string") fail("GenLayer node did not provide a case JSON string");
  const record=JSON.parse(raw);
  if (!record || record.state !== "FINALIZED" || record.id !== caseId) fail("GenLayer case is not finalized");
  if (!hex32(record.policy_id) || !hex32(record.claim_id) || !hex32(record.terms_hash)) fail("invalid case references");
  if (!hex32(record.risk_spec_hash)||!address(record.insured_wallet)) fail("invalid insured risk or owner");
  if (!same(record.claim_id,caseId)) fail("case ID and Base claim identifier must match");
  if (![0,1,2,3,4].includes(record.risk) || ![0,1].includes(record.revision)) fail("invalid risk/revision");
  if (!["COVERED","NOT_COVERED"].includes(record.verdict)) fail("non-settleable GenLayer result");
  if (!Number.isSafeInteger(record.finalized_at) || record.finalized_at <= record.decided_at+259200) fail("GenLayer appeal window not satisfied");
  const digestFields = {
    case_id:record.id,policy_id:record.policy_id,claim_id:record.claim_id,
    terms_hash:record.terms_hash,risk_spec_hash:record.risk_spec_hash,
    verdict:record.verdict,revision:record.revision,
    evidence_hash:record.evidence_hash,coverage_class:record.risk,finalized_at:record.finalized_at,
  };
  const expectedResultDigest=sha256(canonical(digestFields));
  const actualResultDigest=await gen.readContract({
    address:adjudicator,functionName:"get_decision_digest",args:[caseId],
    transactionHashVariant:TransactionHashVariant.LATEST_FINAL,
  });
  if (!same(expectedResultDigest,actualResultDigest)) fail("GenLayer finalized digest mismatch");

  const base=createPublicClient({chain:baseSepolia,transport:http(process.env.BASE_RPC_URL || "https://sepolia.base.org")});
  if (await base.getChainId() !== 84532) fail("Base endpoint wrong chain");
  const baseHead=await base.getBlockNumber();
  if (baseHead<12n) fail("Base endpoint has not reached the safe confirmation window");
  // Read every policy and claim fact from a common 12-confirmed block.
  // Otherwise a fresh, reorg-prone claim lock could authorize attestation.
  const confirmedBlock=baseHead-12n;
  const [policy,lock,boundAdjudicator,boundEvidenceIssuer,resolutionDeadline] = await Promise.all([
    base.readContract({address:basePool,abi:policyAbi,functionName:"policies",args:[record.policy_id],blockNumber:confirmedBlock}),
    base.readContract({address:basePool,abi:policyAbi,functionName:"claimLockOf",args:[record.policy_id],blockNumber:confirmedBlock}),
    base.readContract({address:basePool,abi:policyAbi,functionName:"bradburyAdjudicator",blockNumber:confirmedBlock}),
    base.readContract({address:basePool,abi:policyAbi,functionName:"evidenceIssuer",blockNumber:confirmedBlock}),
    base.readContract({address:basePool,abi:policyAbi,functionName:"claimResolutionDeadline",args:[record.policy_id],blockNumber:confirmedBlock}),
  ]);
  if (!same(adjudicator,boundAdjudicator)) fail("Base pool commits to a different adjudicator");
  if (!same(evidenceIssuer,boundEvidenceIssuer)) fail("Base pool commits to a different evidence issuer wallet");
  if (policy[3] !== 1 || policy[2] !== record.risk || !same(policy[8],record.terms_hash)||
      !same(policy[9],record.risk_spec_hash)||!same(policy[0],record.insured_wallet))
    fail("Base policy, owner, class or frozen insured-risk terms differ");
  if (!same(lock[0],record.claim_id) || !same(lock[1],record.evidence_hash) || lock[3] !== record.revision) fail("Base claim/evidence revision mismatches GenLayer");
  if (BigInt(record.finalized_at) < lock[2]) fail("GenLayer finalization predates owner-locked claim");
  if (BigInt(record.finalized_at) > BigInt(Math.floor(Date.now()/1000))) fail("future finalization timestamp");
  // A claim can bypass the web API entirely. The signed incident time must
  // satisfy Base's actual inception and expiration dates at settlement.
  try { assertIncidentWithinPolicy(record.event_time,policy[5],policy[6]); }
  catch (error) { fail(String(error?.message||error)); }

  const source=new URL(record.source);
  const approved=(process.env.ATTESTOR_EVIDENCE_HOSTS || "").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);
  if (source.protocol !== "https:" || source.username || source.password || source.port ||
      !approved.includes(source.hostname.toLowerCase())) fail("source not in independently reviewed issuer-host allowlist");
  const response=await fetch(source,{redirect:"error",signal:AbortSignal.timeout(15000)});
  if (!response.ok) fail("evidence issuer unavailable");
  const bytes=await readBounded(response,20000);
  if (!bytes.length || bytes.length>20000 || !same(sha256(bytes),record.evidence_hash)) fail("retrieved evidence bytes failed commitment");
  const evidence=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
  if (evidence.schema !== "covra-evidence" || !same(evidence.policy_id,record.policy_id) ||
    !same(evidence.risk_spec_hash,record.risk_spec_hash) ||
    canonical(evidence.risk_spec)!==canonical(record.risk_spec) ||
    !same(evidence.claim_id,record.claim_id) || !same(evidence.terms_hash,record.terms_hash) ||
    evidence.coverage_class !== record.risk || evidence.event_time !== record.event_time ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(String(evidence.observation_id||"")) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(String(evidence.observed_at||"")) ||
    evidence.observation_mode !== "OBSERVED_PUBLIC" ||
    !evidence.source_details || evidence.source_details.issuer_host!==record.risk_spec.evidenceIssuerHost ||
    evidence.source_details.endpoint!==record.source ||
    evidence.source_details.retrieval_method !== "https_get" ||
    typeof evidence.source_details.origin_url !== "string" ||
    !evidence.source_details.origin_url.startsWith("https://") ||
    !hex32(evidence.source_details.origin_payload_digest) ||
    !same(evidence.source_details.source_payload_digest,sha256(canonical(evidence.facts)))) fail("evidence envelope policy binding failed");
  if (!validFacts(record.risk,evidence.facts,record.risk_spec)) fail("issuer facts do not identify the frozen insured exposure");
  if (source.hostname.toLowerCase()!==record.risk_spec.evidenceIssuerHost) fail("source differs from policy's issuer");
  const issuer=evidence.issuer;
  const wallets=JSON.parse(process.env.ATTESTOR_ISSUER_WALLETS || "{}");
  const expectedIssuer=wallets[source.hostname.toLowerCase()];
  if (!issuer||!address(issuer.wallet)||!address(expectedIssuer)||!same(issuer.wallet,expectedIssuer)||
      !Number.isSafeInteger(issuer.signed_at)||!Number.isSafeInteger(issuer.expires_at)||
      issuer.signed_at>Math.floor(Date.now()/1000)+300||
      issuer.expires_at<=Math.floor(Date.now()/1000)||issuer.expires_at<=issuer.signed_at||
      !/^0x[0-9a-fA-F]{130}$/.test(issuer.signature||"")) fail("issuer provenance missing or expired");
  const unsigned={...evidence,issuer:{wallet:issuer.wallet.toLowerCase(),
    signed_at:issuer.signed_at,expires_at:issuer.expires_at}};
  const recovered=await recoverMessageAddress({
    message:"COVRA-ISSUER-EVIDENCE:"+sha256(canonical(unsigned)),signature:issuer.signature,
  });
  if (!same(recovered,expectedIssuer)) fail("issuer signature invalid");
  const payout=record.verdict === "COVERED" ? cappedPayout(record.risk,policy[4],evidence.facts,record.risk_spec) : 0n;
  // The preflight is deliberately rerun by attestor-sign. A moving
  // `now + 3600` deadline made the exact EIP-712 object change between those
  // two independent reads, preventing legitimate signers from ever signing.
  // The Base resolution deadline is an immutable, common value unless the
  // authorized quorum explicitly extends the claim, which invalidates old
  // preflight statements and requires fresh operator review.
  const deadline=Number(resolutionDeadline);
  if (!Number.isSafeInteger(deadline) || deadline<=Math.floor(Date.now()/1000))
    fail("claim settlement grace already expired or deadline unsafe");
  const decision={policyId:record.policy_id,claimId:record.claim_id,
    bradburyDecisionId:caseId,genlayerTxId:finalizationTx,
    evidenceDigest:record.evidence_hash,resultDigest:expectedResultDigest,
    termsHash:record.terms_hash,riskSpecHash:record.risk_spec_hash,
    recipient:policy[1],amount:payout.toString(),coverageClass:record.risk,
    verdict:record.verdict==="COVERED"?1:2,revision:record.revision,
    finalizedAt:String(record.finalized_at),deadline:String(deadline),
    sourceChainId:"4221",adjudicator};
  process.stdout.write(encodePreflightOutput({
    status:"SOURCE_CHECKS_PASSED_NOT_SIGNABLE",
    caseId,basePolicyId:record.policy_id,baseClaimId:record.claim_id,
    adjudicator,verdict:record.verdict,revision:record.revision,
    resultDigest:expectedResultDigest,evidenceDigest:record.evidence_hash,
    riskSpecHash:record.risk_spec_hash,insured:record.insured_wallet,
    issuerWallet:expectedIssuer,decision,
    beneficiary:policy[1],payoutMicroUsdc:payout.toString(),
    baseConfirmationBlock:confirmedBlock.toString(),incidentTime:record.event_time,
    mandatoryIndependentChecks:[
      "Independently verify the approved evidence issuer's authority and signed observation, not merely its host",
      "Verify Base block finality and GenLayer transaction lifecycle/finality with independent node operators",
      "Verify contractual mandate, incident attribution, loss valuation, exclusions, anti-collusion and claims history",
      "Check policy's frozen terms hash and exact beneficiary; validate the claim deadline and any signed grace extension",
      "Only then prepare an EIP-712 Decision; NEVER sign merely because this preflight printed a candidate",
    ],
  }));
}
main().catch(error=>{console.error(String(error?.message || error));process.exitCode=1;});
