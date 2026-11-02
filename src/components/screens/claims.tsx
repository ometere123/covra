"use client";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowUpRight, ClipboardCheck, FilePlus2, Paperclip, ShieldCheck, UploadCloud } from "lucide-react";
import { coverages, formatUsdc } from "@/lib/catalog";
import { useWallet } from "@/components/wallet-provider";
import { EmptyState, PageHeading, Panel, StatusTag, SyncNotice } from "@/components/ui";
import { createWalletClient, custom } from "viem";
import { baseSepolia } from "viem/chains";
import { baseClient, configuredPoolAddress, poolsAbi } from "@/lib/chain";
import { configuredAdjudicator, readBradburyCase, writeBradburyAction, writeBradburyCase } from "@/lib/bradbury-client";
import { canonicalJson, claimIdFromUuid } from "@/lib/claim-protocol";
import { planAppealRecovery } from "@/lib/appeal-recovery";

export default function ClaimsScreen() {
  const wallet=useWallet();
  const {authenticated}=wallet;
  const [claims,setClaims]=useState<any[]>([]);
  const [policies,setPolicies]=useState<any[]>([]);
  const [claimState,setClaimState]=useState("SIGNED_OUT");
  const [claimMessage,setClaimMessage]=useState("");
  const [policyId,setPolicyId]=useState("");
  const [date,setDate]=useState("");
  const [description,setDescription]=useState("");
  const [source,setSource]=useState("");
  const [sourceDigest,setSourceDigest]=useState("");
  const [requested,setRequested]=useState(100);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [created,setCreated]=useState("");
  const [onchainClaimId,setOnchainClaimId]=useState("");
  const [confirmedDigest,setConfirmedDigest]=useState("");
  const [lockTx,setLockTx]=useState("");
  const [bradburyTx,setBradburyTx]=useState("");
  const [decisionTx,setDecisionTx]=useState("");
  const [finalTx,setFinalTx]=useState("");
  const [appealSource,setAppealSource]=useState("");
  const [appealDigest,setAppealDigest]=useState("");
  const [certificate,setCertificate]=useState("");
  const [caseStatus,setCaseStatus]=useState("");
  const [recoveryHash,setRecoveryHash]=useState("");
  const [recoveryPhase,setRecoveryPhase]=useState("BASE_LOCKED");
  const [bradburyFee,setBradburyFee]=useState("");
  const [evidence,setEvidence]=useState<File|null>(null);
  const [evidenceReceipt,setEvidenceReceipt]=useState("");
  const refresh=()=>{
    if(!authenticated){setClaims([]);setPolicies([]);setClaimState("SIGNED_OUT");return;}
    void Promise.all([fetch("/api/claims").then(r=>r.json()),fetch("/api/policies").then(r=>r.json())]).then(([c,p])=>{
      setClaims(Array.isArray(c.items)?c.items:[]);
      setClaimState(String(c.state||"SYNCHRONIZATION_ERROR"));
      setClaimMessage(String(c.message||c.error||""));
      if(p.items){setPolicies(p.items);if(p.items.length&&!policyId)setPolicyId(p.items[0].policy_id);}
    }).catch(()=>{setClaims([]);setPolicies([]);setClaimState("SYNCHRONIZATION_ERROR");setClaimMessage("The reconciled claim index could not be reached.");});
  };
  useEffect(refresh,[authenticated]);
  const chosen=policies.find(p=>p.policy_id===policyId);
  const currentClaim=claims.find(c=>String(c.id)===created);
  const appealSynchronizationPending=currentClaim?.status==="APPEAL_SYNC_PENDING";
  const saveReceipt=async(phase:string,hash:string,digest?:string,evidenceSource?:string)=>{
    const result=await fetch("/api/claims/chain-proof",{method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({claimId:created,txHash:hash,phase,...(digest?{evidenceDigest:digest}:{}),...(evidenceSource?{evidenceSource}: {})}),
    });
    const info=await result.json();
    if (!result.ok) throw new Error(info.error||"Chain proof verification is still pending");
    refresh();
    return info;
  };
  const resume=(claim:any)=>{
    setPolicyId(String(claim.policy_id));setCreated(String(claim.id));
    setOnchainClaimId(claimIdFromUuid(String(claim.id),String(claim.claimant_wallet)));
    setConfirmedDigest(String(claim.evidence_manifest_hash));
    setLockTx(String(claim.base_lock_tx_hash||""));
    setBradburyTx(String(claim.bradbury_tx_hash||""));
    setDecisionTx(String(claim.bradbury_decision_tx_hash||""));
    setFinalTx(String(claim.bradbury_finalization_tx_hash||""));
    setDescription(String(claim.description));
    setSource(String((claim.evidence_urls||[])[0]||""));
    setSourceDigest(String(claim.evidence_manifest_hash));
    setAppealDigest(String(claim.pending_appeal_digest || (Number(claim.evidence_revision)===1 ? claim.evidence_manifest_hash : "")));
    setAppealSource(String(claim.appeal_evidence_url || ""));
    setDate(new Date(claim.incident_at).toISOString().slice(0,16));
    setRequested(Number(claim.requested_micro_usdc)/1e6);
    setError("");setCaseStatus(String(claim.status));
  };
  const submit=async()=>{
    setBusy(true);setError("");setCreated("");
    try {
      if(!chosen)throw new Error("Select a real indexed Base policy.");
      if(!source.startsWith("https://"))throw new Error("Provide an HTTPS evidence source.");
      const response=await fetch("/api/claims",{
        method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":crypto.randomUUID()},
        body:JSON.stringify({
          policyId,coverageClass:Number(chosen.coverage_class),
          incidentAt:new Date(date).toISOString(),description,
          evidenceUrls:[source],requestedMicroUsdc:Math.round(requested*1e6).toString(),
          evidenceCommitment:sourceDigest,
        }),
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||"Claim intake was rejected.");
      setCreated(body.claim.id);
      setOnchainClaimId(body.onchainClaimId);
      setConfirmedDigest(body.evidenceDigest);
      refresh();
    }catch(e){setError(e instanceof Error?e.message:"Claim intake failed");}
    finally{setBusy(false);}
  };
  const cancelUnanchored=async(claim:any)=>{
    if (!window.confirm("Withdraw this unanchored claim intake? First revoke any untrusted agent credential and make sure no Base claim transaction is pending. This does not undo an on-chain transaction.")) return;
    setBusy(true);setError("");
    try {
      const response=await fetch("/api/claims",{
        method:"DELETE",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({claimId:String(claim.id),confirmedNoPendingBaseTransaction:true}),
      });
      const info=await response.json();
      if(!response.ok)throw new Error(info.error||"Cannot withdraw this claim intake");
      if(created===claim.id){setCreated("");setOnchainClaimId("");setLockTx("");setBradburyTx("");setDecisionTx("");setFinalTx("");}
      setCaseStatus("Unanchored intake withdrawn. You may file a new claim only after confirming Base has no pending lock.");
      refresh();
    }catch(e){setError(e instanceof Error?e.message:"Claim withdrawal failed");}
    finally{setBusy(false);}
  };
  const lockOnBase=async()=>{
    setBusy(true);setError("");
    try {
      if(!wallet.address||!onchainClaimId||!confirmedDigest||!chosen)
        throw new Error("Create a claim and connect the insured wallet first.");
      if(!window.ethereum)throw new Error("An injected wallet is required.");
      const contract=configuredPoolAddress();
      if(!contract)throw new Error("The Base Sepolia pool contract has not been deployed.");
      if(wallet.chainId!==84532)await wallet.switchToBase();
      const client=createWalletClient({account:wallet.address,chain:baseSepolia,transport:custom(window.ethereum)});
      const hash=await client.writeContract({
        address:contract,abi:poolsAbi,functionName:"openClaim",
        args:[chosen.policy_id as `0x${string}`,onchainClaimId as `0x${string}`,confirmedDigest as `0x${string}`],
        account:wallet.address,chain:baseSepolia,
      });
      const receipt=await baseClient.waitForTransactionReceipt({hash});
      if(receipt.status!=="success")throw new Error("Base claim lock transaction reverted");
      setLockTx(hash);
      await baseClient.waitForTransactionReceipt({hash,confirmations:12});
      await saveReceipt("BASE_LOCKED",hash);
    }catch(e){setError(e instanceof Error?e.message:"Claim lock transaction failed");}
    finally{setBusy(false);}
  };
  const upload=async()=>{
    setError("");setBusy(true);
    try{
      if(!created||!evidence)throw new Error("Create a claim and choose a file.");
      const form=new FormData();
      form.set("claimId",created);form.set("file",evidence);
      const response=await fetch("/api/evidence",{method:"POST",body:form});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Private evidence upload failed");
      setEvidenceReceipt(data.evidence.sha256_hex);
    }catch(e){setError(e instanceof Error?e.message:"Upload failed");}
    finally{setBusy(false);}
  };
  const submitToBradbury=async()=>{
    setBusy(true);setError("");
    try {
      if(!lockTx||!created||!wallet.address||!onchainClaimId||!confirmedDigest||!chosen)
        throw new Error("The Base claim must be confirmed before Bradbury submission.");
      if(!window.ethereum)throw new Error("An injected wallet is required.");
      const adjudicator=configuredAdjudicator();
      if(!adjudicator)throw new Error("Bradbury adjudicator is not configured.");
      const limit=BigInt(String(chosen.cover_micro_usdc));
      const requestedMicro=BigInt(Math.round(requested*1e6));
      const bps=Number((requestedMicro*10000n+limit-1n)/limit);
      if(bps<1||bps>10000)throw new Error("Requested amount exceeds policy limit.");
      if (!chosen.risk_spec_json||!chosen.risk_spec_hash) throw new Error("Specific insured-risk terms not indexed");
      const args:(string|number)[]=[
        onchainClaimId,policyId,onchainClaimId,String(chosen.owner_wallet),created,
        Number(chosen.coverage_class),String(chosen.terms_hash),
        canonicalJson(chosen.risk_spec_json),String(chosen.risk_spec_hash),
        source,confirmedDigest,new Date(date).toISOString(),bps,
      ];
      const {txHash,feeDeposit}=await writeBradburyCase(
        window.ethereum,wallet.address,adjudicator,args,
      );
      setBradburyTx(txHash);setBradburyFee(feeDeposit);
      await saveReceipt("BRADBURY_SUBMITTED",txHash);
    }catch(e){setError(e instanceof Error?e.message:"Bradbury submission failed.");}
    finally{setBusy(false);}
  };
  const adjudicate=async()=>{
    setBusy(true);setError("");
    try{
      if (!wallet.address||!window.ethereum||!onchainClaimId||!created) throw new Error("Choose an existing case first");
      const adjudicator=configuredAdjudicator();
      if (!adjudicator) throw new Error("Bradbury contract not configured");
      const {txHash}=await writeBradburyAction(window.ethereum,wallet.address,adjudicator,"adjudicate",[onchainClaimId]);
      setDecisionTx(txHash);await saveReceipt("BRADBURY_DECIDED",txHash);
      const record=await readBradburyCase(adjudicator,onchainClaimId);
      setCaseStatus(record.verdict+": "+record.reason);
    }catch(e){setError(e instanceof Error?e.message:"Adjudication failed");}
    finally{setBusy(false);}
  };
  const appeal=async()=>{
    setBusy(true);setError("");
    try{
      if (!wallet.address||!window.ethereum||!chosen||!onchainClaimId||!created)
        throw new Error("Resume your decided claim first");
      if (!/^0x[0-9a-fA-F]{64}$/.test(appealDigest)) throw new Error("Provide the revised independent evidence SHA-256");
      const pool=configuredPoolAddress();const adjudicator=configuredAdjudicator();
      if (!pool||!adjudicator) throw new Error("Contracts are not configured");
      // The two transactions cannot be atomic. Inspect BOTH immutable chain
      // states before attempting either one; never repeat a consumed revision.
      const current=await readBradburyCase(adjudicator,onchainClaimId);
      const appealUrl=new URL(appealSource);
      if (appealUrl.protocol!=="https:"||appealUrl.username||appealUrl.password||appealUrl.port||
          appealUrl.hostname.toLowerCase()!==current.risk_spec?.evidenceIssuerHost)
        throw new Error("Appeal must use the frozen policy's public HTTPS evidence issuer");
      const locked=await baseClient.readContract({address:pool,abi:poolsAbi,functionName:"claimLockOf",
        args:[chosen.policy_id as `0x${string}`]});
      if (locked[0].toLowerCase()!==onchainClaimId.toLowerCase())
        throw new Error("Base does not contain the expected locked claim");
      const plan=planAppealRecovery({
        baseRevision:Number(locked[3]),baseDigest:locked[1],
        bradburyRevision:Number(current.revision),bradburyDigest:current.evidence_hash,
        bradburyState:current.state,desiredDigest:appealDigest,
      });
      const latestResponse=await fetch("/api/claims",{cache:"no-store"});
      if(!latestResponse.ok)throw new Error("Cannot retrieve the persisted appeal recovery state");
      const latest=(await latestResponse.json()).items?.find((x:any)=>String(x.id)===created);
      if (!latest) throw new Error("Claim no longer exists in the authenticated account");
      if (Number(locked[3])===1 &&
          (Number(latest.evidence_revision)!==1||String(latest.evidence_manifest_hash).toLowerCase()!==appealDigest.toLowerCase()))
        throw new Error("Base is already revised but its receipt is missing locally. Recover BASE_REVISED using its original transaction hash, then retry.");
      if (Number(current.revision)===1 && Number(locked[3])===0 &&
          String(latest.pending_appeal_digest).toLowerCase()!==appealDigest.toLowerCase())
        throw new Error("Bradbury appeal exists but its receipt is missing locally. Recover BRADBURY_APPEALED with its original transaction hash and digest first.");
      if (Number(current.revision)===0) {
        if (current.appeal_used || !Number.isSafeInteger(current.decided_at) ||
            Date.now()/1000>current.decided_at+3*86400)
          throw new Error("The GenLayer one-appeal window has closed; Base revision cannot revive it");
        if (appealDigest.toLowerCase()===current.evidence_hash.toLowerCase())
          throw new Error("An appeal requires independently new evidence");
      }
      if (plan==="APPEAL_BRADBURY_AND_REVISE_BASE"||plan==="SUBMIT_BRADBURY_ONLY") {
        // Bradbury's three-day deadline is shorter than Base's recovery window.
        const {txHash}=await writeBradburyAction(window.ethereum,wallet.address,adjudicator,"appeal",
          [onchainClaimId,appealSource,appealDigest]);
        setRecoveryPhase("BRADBURY_APPEALED");setRecoveryHash(txHash);
        await saveReceipt("BRADBURY_APPEALED",txHash,appealDigest,appealSource);
      }
      if (plan==="APPEAL_BRADBURY_AND_REVISE_BASE"||plan==="REVISE_BASE_ONLY") {
        await wallet.switchToBase();
        const chainId=await window.ethereum.request({method:"eth_chainId"});
        if(Number(BigInt(String(chainId)))!==84532)throw new Error("Wallet must be on Base Sepolia to synchronize the revision");
        const baseWallet=createWalletClient({account:wallet.address,chain:baseSepolia,transport:custom(window.ethereum)});
        const lockHash=await baseWallet.writeContract({address:pool,abi:poolsAbi,functionName:"reviseClaimEvidence",
          args:[chosen.policy_id as `0x${string}`,appealDigest as `0x${string}`],account:wallet.address,chain:baseSepolia});
        setRecoveryPhase("BASE_REVISED");setRecoveryHash(lockHash);
        const receipt=await baseClient.waitForTransactionReceipt({hash:lockHash,confirmations:12});
        if(receipt.status!=="success")throw new Error("Base evidence revision reverted");
        await saveReceipt("BASE_REVISED",lockHash,appealDigest);
      }
      if (plan==="ALREADY_SYNCHRONIZED" &&
          (Number(latest.evidence_revision)!==1||!latest.bradbury_appeal_tx_hash))
        throw new Error("Both networks show the appeal, but a verified receipt is missing in the account. Reconcile the original transaction before continuing.");
      setSource(appealSource);setConfirmedDigest(appealDigest);setSourceDigest(appealDigest);
      setDecisionTx("");setFinalTx("");setCaseStatus("Appeal evidence synchronized on Bradbury and Base. Request re-adjudication when the verified receipts are recorded.");
    }catch(e){setError(e instanceof Error?e.message:"Appeal interrupted. Reconcile both chain states and resume the missing leg without repeating the consumed revision.");}
    finally{setBusy(false);}
  };
  const finalize=async()=>{
    setBusy(true);setError("");
    try{
      if (!wallet.address||!window.ethereum||!onchainClaimId||!created) throw new Error("Resume a decided claim first");
      const adjudicator=configuredAdjudicator();if(!adjudicator)throw new Error("Adjudicator not configured");
      const {txHash}=await writeBradburyAction(window.ethereum,wallet.address,adjudicator,"finalize_case",[onchainClaimId]);
      setFinalTx(txHash);await saveReceipt("BRADBURY_FINALIZED",txHash);
      const record=await readBradburyCase(adjudicator,onchainClaimId);
      setCaseStatus(record.verdict+": "+record.reason);
    }catch(e){setError(e instanceof Error?e.message:"Finalization failed; the three-day appeal window may still be open");}
    finally{setBusy(false);}
  };
  const settle=async()=>{
    setBusy(true);setError("");
    try{
      if (!created||!chosen||!wallet.address||!window.ethereum||!finalTx)throw new Error("Resume a finalized case and connect wallet");
      const pool=configuredPoolAddress();if(!pool)throw new Error("Base pool not configured");
      const bundle=JSON.parse(certificate);
      if (!bundle?.decision||!Array.isArray(bundle.signatures)||bundle.signatures.length<3)
        throw new Error("Provide a 3-of-5 independent settlement certificate bundle");
      const d=bundle.decision;
      if (String(d.policyId).toLowerCase()!==policyId.toLowerCase()||
          String(d.claimId).toLowerCase()!==onchainClaimId.toLowerCase()||
          String(d.riskSpecHash).toLowerCase()!==String(chosen.risk_spec_hash).toLowerCase())
        throw new Error("Settlement certificate concerns a different insured risk or case");
      if (wallet.chainId!==84532)await wallet.switchToBase();
      const baseWallet=createWalletClient({account:wallet.address,chain:baseSepolia,transport:custom(window.ethereum)});
      const message={...d,amount:BigInt(d.amount),finalizedAt:BigInt(d.finalizedAt),
        deadline:BigInt(d.deadline),sourceChainId:BigInt(d.sourceChainId)};
      const hash=await baseWallet.writeContract({address:pool,abi:poolsAbi,functionName:"settle",
        args:[message,bundle.signatures],account:wallet.address,chain:baseSepolia});
      await baseClient.waitForTransactionReceipt({hash,confirmations:12});
      const result=await saveReceipt("BASE_SETTLED",hash);
      setCaseStatus(result.status+": confirmed on Base Sepolia");
    }catch(e){setError(e instanceof Error?e.message:"Independent settlement could not be confirmed");}
    finally{setBusy(false);}
  };
  const rows=claims.map(x=>({
    id:String(x.id).slice(0,11)+"…",policy:String(x.policy_id).slice(0,14)+"…",risk:Number(x.coverage_class),
    agent:"Owned policy",amount:Number(x.requested_micro_usdc)/1e6,status:String(x.status).replaceAll("_"," "),
    date:new Date(x.created_at).toLocaleDateString("en-GB"),source:x,
  }));
  return <>
    <PageHeading eyebrow="CLAIMS / EVIDENCE + CONSENSUS" title="The claims desk." subtitle="Document an incident, preserve evidence, obtain a GenLayer decision and follow its independent settlement trail."/>
    {!authenticated&&<SyncNotice text="Connect and sign in to inspect or submit claims for a wallet-owned Base policy."/>}
    {authenticated&&claimState!=="CONFIRMED"&&claimState!=="LOADING"&&<SyncNotice text={claimMessage||"The claim register is awaiting synchronization."}/>} 
    <div className="dashboard-two" style={{marginBottom:19}}>
      <div className="panel integrity-panel"><div className="detail-label">Claim integrity</div><h3>Facts before funds</h3><p>Evidence is stored privately and hashed. Where possible, GenLayer validators independently fetch public factual sources, and each Base settlement requires a threshold of finality attestations.</p></div>
      <div className="panel integrity-panel"><div className="detail-label">No silent payouts</div><h3>Every step can be challenged</h3><p>The GenLayer contract records a reasoned verdict and supports one evidence revision. Offchain intake alone never triggers a USDC payout.</p></div>
    </div>
    <Panel title="Claims register" sub="Authenticated account history">
      {!authenticated?<EmptyState title="No account selected" text="Connect a wallet and sign in to load the claim register."/>:rows.length?<div className="data-table-wrap"><table className="data-table"><thead><tr><th>Claim</th><th>Policy</th><th>Coverage</th><th>Request</th><th>Status</th><th>Opened</th><th>Action</th></tr></thead><tbody>{rows.map(c=><tr key={c.id}><td>{c.id}</td><td>{c.policy}</td><td>{coverages[c.risk]?.name}</td><td>{formatUsdc(c.amount)}</td><td><StatusTag variant={c.status.toLowerCase().includes("paid")?"verified":"pending"}>{c.status}</StatusTag></td><td className="table-muted">{c.date}</td><td><button className="secondary-action" disabled={busy||c.source?.status==="CANCELLED"} onClick={()=>resume(c.source)}>Resume</button>{c.source?.status==="AWAITING_EVIDENCE"&&!c.source.base_lock_tx_hash&&<button className="secondary-action" disabled={busy} onClick={()=>cancelUnanchored(c.source)}>Withdraw draft</button>}</td></tr>)}</tbody></table></div>:
      <EmptyState title="No submitted claims" text={claimState==="CONFIRMED"?"No claim intake has been recorded for this wallet.":"Claims will appear after the reconciled database is available."}/>} 
    </Panel>
    <div className="form-layout" style={{marginTop:19}}>
      <div className="panel form-panel">
        <div className="form-block-title"><span>01</span> Report a covered incident</div>
        <div className="field"><label htmlFor="claim-policy">YOUR INDEXED BASE POLICY</label><select id="claim-policy" value={policyId} onChange={e=>setPolicyId(e.target.value)}>
          {!policies.length&&<option value="">No indexed policies available</option>}
          {policies.map(x=><option key={x.policy_id} value={x.policy_id}>{x.policy_id.slice(0,16)}… · {coverages[Number(x.coverage_class)]?.name}</option>)}
        </select></div>
        <div className="field-grid">
          <div className="field"><label htmlFor="claim-date">INCIDENT TIMESTAMP</label><input className="input" id="claim-date" type="datetime-local" value={date} onChange={e=>setDate(e.target.value)}/></div>
          <div className="field"><label htmlFor="claim-amount">REQUESTED LOSS (USDC)</label><input className="input" id="claim-amount" type="number" value={requested} min={1} step="0.01" onChange={e=>setRequested(Number(e.target.value))}/></div>
        </div>
        <div className="field"><label htmlFor="claim-desc">WHAT HAPPENED? (80–4,000 CHARACTERS)</label><textarea id="claim-desc" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe the authorized agent task, expected outcome, actual event, loss calculation and available independent evidence." /></div>
        <div className="field"><label htmlFor="claim-source">PUBLIC HTTPS EVIDENCE SOURCE</label><input className="input" id="claim-source" value={source} onChange={e=>setSource(e.target.value)} placeholder="https://..." /><span className="field-hint">Private claim attachments are not automatically public or independently verifiable. For GenLayer adjudication, choose a source on the contract's approved domain list.</span></div>
        <div className="field"><label htmlFor="claim-digest">PUBLIC EVIDENCE SHA-256 (0x + 64 HEX CHARACTERS)</label><input className="input" id="claim-digest" value={sourceDigest} onChange={e=>setSourceDigest(e.target.value)} placeholder="0x..." /><span className="field-hint">Hash the exact raw response bytes at the public source URL. Validators independently fetch them and must reject any changed content. The private attachment digest is not a substitute.</span></div>
        <button className="primary-action" disabled={!authenticated||!policies.length||busy} onClick={submit}><ClipboardCheck size={15}/>{busy?"Submitting…":"Submit claim intake"}<ArrowUpRight size={15}/></button>
        {created&&<button className="secondary-action" disabled={!authenticated||busy||Boolean(lockTx)} onClick={lockOnBase}><ShieldCheck size={15}/>{lockTx?"Claim locked on Base":"Lock claim and reserve on Base Sepolia"}</button>}
        {lockTx&&<button className="secondary-action" disabled={busy||Boolean(bradburyTx)} onClick={submitToBradbury}><ShieldCheck size={15}/>{bradburyTx?"Bradbury case submitted":"Submit to GenLayer validators (Bradbury Phase 2)"}</button>}
        {bradburyTx&&!decisionTx&&!appealSynchronizationPending&&<button className="secondary-action" disabled={busy} onClick={adjudicate}><ShieldCheck size={15}/> Request independent GenLayer adjudication</button>}
        {decisionTx&&!finalTx&&!appealSynchronizationPending&&<button className="secondary-action" disabled={busy} onClick={finalize}><ShieldCheck size={15}/> Finalize after three-day appeal window</button>}
        {appealSynchronizationPending&&<div className="feedback feedback-error">Cross-chain appeal synchronization is incomplete. Resume the unmatched Base or Bradbury step and reconcile its actual receipt before re-adjudication or final settlement.</div>}
        {decisionTx&&!finalTx&&<div className="form-block">
          <div className="form-block-title"><span>03</span> Optional single appeal</div>
          <div className="field"><label htmlFor="appeal-source">NEW APPROVED ISSUER URL</label><input className="input" id="appeal-source" value={appealSource} onChange={e=>setAppealSource(e.target.value)}/></div>
          <div className="field"><label htmlFor="appeal-digest">REPLACEMENT RESPONSE SHA-256</label><input className="input" id="appeal-digest" value={appealDigest} onChange={e=>setAppealDigest(e.target.value)}/></div>
          <button className="secondary-action" disabled={busy||!appealSource||!appealDigest} onClick={appeal}>Submit appeal and synchronize both chains</button>
          <p className="field-hint">Bradbury is updated first to protect its shorter appeal window. If Base or a receipt update fails, resume the missing leg; never submit a second appeal. The two blockchains cannot commit atomically.</p>
        </div>}
        {finalTx&&<div className="form-block">
          <div className="form-block-title"><span>04</span> Independent USDC settlement</div>
          <p className="field-hint">Each of three independently operated attestors must verify Bradbury finality, approved signed evidence, the insured risk and the Base claim lock. Paste their verified aggregate certificate here. COVRA never generates quorum signatures on the user's behalf.</p>
          <div className="field"><label htmlFor="settlement-certificate">ATTESTED DECISION AND SIGNATURES (JSON)</label><textarea id="settlement-certificate" value={certificate} onChange={e=>setCertificate(e.target.value)} placeholder='{"decision":{...},"signatures":[...]}' /></div>
          <button className="primary-action" disabled={busy||!certificate} onClick={settle}><ShieldCheck size={15}/> Execute independently attested Base settlement</button>
        </div>}
        {!authenticated&&<div className="feedback"><AlertCircle size={15}/> Sign in with your wallet to use the claims intake.</div>}
        {created&&<div className="feedback">Claim intake accepted: <strong>{created}</strong>. This is not a GenLayer verdict or a payout authorization.</div>}
        {lockTx&&<div className="feedback">Base claim lock confirmed: <a href={"https://sepolia.basescan.org/tx/"+lockTx} target="_blank" rel="noreferrer">View transaction ↗</a>. The reserve remains committed during the bounded adjudication window; Bradbury execution is the next separately verified step.</div>}
        {bradburyTx&&<div className="feedback">Bradbury submission finalized: <strong>{bradburyTx}</strong>. Estimated upfront GEN fee allocation: {bradburyFee} wei (actual consumed fees and refunds must be checked in the receipt). Submitting the case does not adjudicate or settle it; further fee-aware transactions, one appeal window and independent attestations are required.</div>}
        {caseStatus&&<div className="feedback">Verified claim progression: <strong>{caseStatus}</strong></div>}
        {created&&<div className="form-block">
          <div className="form-block-title"><span>05</span> Resume a confirmed chain transaction</div>
          <div className="field"><label htmlFor="recover-phase">TRANSACTION TYPE</label><select id="recover-phase" value={recoveryPhase} onChange={e=>setRecoveryPhase(e.target.value)}>{["BASE_LOCKED","BASE_REVISED","BRADBURY_SUBMITTED","BRADBURY_DECIDED","BRADBURY_APPEALED","BRADBURY_FINALIZED","BASE_SETTLED"].map(x=><option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}</select></div>
          <div className="field"><label htmlFor="recover-hash">EXACT TRANSACTION HASH</label><input className="input" id="recover-hash" value={recoveryHash} onChange={e=>setRecoveryHash(e.target.value)} placeholder="0x..."/></div>
      <button className="secondary-action" disabled={busy||!recoveryHash} onClick={()=>void saveReceipt(recoveryPhase,recoveryHash,["BASE_REVISED","BRADBURY_APPEALED"].includes(recoveryPhase)?appealDigest:undefined,recoveryPhase==="BRADBURY_APPEALED"?appealSource:undefined).then(()=>setCaseStatus("Recovered chain receipt")).catch(e=>setError(String(e)))}>Reconcile verified receipt with account</button>
        </div>}
        {error&&<div className="feedback feedback-error">{error}</div>}
      </div>
      <aside className="panel form-panel">
        <div className="form-block-title"><span>02</span> Evidence locker</div>
        <div className="evidence-dropzone">
          <UploadCloud size={29}/>
          <p style={{fontSize:13,margin:"13px 0 8px",fontWeight:750}}>Store supporting material privately</p>
          <p>PDF, JSON, TXT, JPG or PNG · up to 5 MB. Each attachment receives a SHA-256 digest.</p>
          <input aria-label="Evidence attachment" type="file" accept=".pdf,.json,.txt,.jpg,.jpeg,.png" onChange={e=>setEvidence(e.target.files?.[0]||null)} style={{width:"100%",fontSize:11}}/>
        </div>
        <button className="secondary-action" disabled={!created||!evidence||busy} onClick={upload}><Paperclip size={15}/> Attach to claim</button>
        {evidenceReceipt&&<div className="key-result"><span className="detail-label">VERIFIED DIGEST</span><code>{evidenceReceipt}</code></div>}
        <div className="feedback" style={{marginTop:21}}><ShieldCheck size={16}/> Onchain adjudication and attested payouts are separate controlled steps. Never treat an API intake response as claim approval.</div>
      </aside>
    </div>
  </>;
}
