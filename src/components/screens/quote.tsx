"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, ArrowUpRight, CheckCircle2, LockKeyhole, ShieldCheck, Wallet, CircleDollarSign, Info } from "lucide-react";
import { createWalletClient, custom, parseUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { coverages, formatUsdc } from "@/lib/catalog";
import { calculateTestnetQuote } from "@/lib/quote";
import { canonicalTermsHash } from "@/lib/terms";
import { referenceLabels, subjectLabels } from "@/lib/risk-spec";
import { baseClient, BASE_USDC, configuredPoolAddress, poolsAbi, quoteToAbi, type SignedQuote, usdcAbi } from "@/lib/chain";
import { transactionPhaseLabel, transactionPhaseTone, type TransactionPhase } from "@/lib/transaction-state";
import { useWallet } from "@/components/wallet-provider";
import { PageHeading, TestnetNotice } from "@/components/ui";

type QuoteAPI = {
  mode: "preview" | "testnet-ready";
  executable: boolean;
  premiumUsd: number;
  coverageUsd: number;
  reason?: string;
  signature?: `0x${string}`;
  quote?: SignedQuote;
};

export default function QuoteScreen() {
  const params = useSearchParams();
  const wallet = useWallet();
  const [risk,setRisk]=useState(0);
  const [limit,setLimit]=useState(5000);
  const [days,setDays]=useState(30);
  const [beneficiary,setBeneficiary]=useState("");
  const [insuredSubject,setInsuredSubject]=useState("");
  const [referenceHash,setReferenceHash]=useState("");
  const [scopeStatement,setScopeStatement]=useState("");
  const [issuerHost,setIssuerHost]=useState("");
  const [result,setResult]=useState<QuoteAPI|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [tx,setTx]=useState("");
  const [transactionPhase,setTransactionPhase]=useState<TransactionPhase>("IDLE");
  const [transactionLabel,setTransactionLabel]=useState("Policy transaction");
  const [transactionHash,setTransactionHash]=useState("");
  const [transactionError,setTransactionError]=useState("");
  useEffect(()=>{
    const index=coverages.findIndex(x=>x.slug===params.get("risk"));
    if(index>=0) setRisk(index);
  },[params]);
  useEffect(()=>{if(wallet.address&&!beneficiary)setBeneficiary(wallet.address);},[wallet.address,beneficiary]);
  useEffect(()=>{setResult(null);},[risk,limit,days,beneficiary,insuredSubject,referenceHash,scopeStatement,issuerHost]);
  const selected=coverages[risk];
  const estimate=useMemo(()=>{
    try{return calculateTestnetQuote({
      coverageClass:risk,coverageUsd:limit,durationDays:Math.min(days,selected.maxDurationDays),
    });}catch{return null;}
  },[risk,limit,days,selected.maxDurationDays]);

  const beginTransaction=(label:string)=>{
    setTransactionLabel(label);setTransactionHash("");setTransactionError("");
    setTransactionPhase("AWAITING_SIGNATURE");
  };

  const preview=async()=>{
    setBusy(true);setError("");setResult(null);setTx("");
    try {
      if(!wallet.address)throw new Error("Connect a wallet to request a quote.");
      const response=await fetch("/api/quotes",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          coverageClass:risk,coverageUsd:limit,durationDays:days,
          insured:wallet.address,beneficiary:beneficiary||wallet.address,
          termsHash:canonicalTermsHash(risk),
          riskSpec:{coverageClass:risk,subject:insuredSubject,referenceHash,
            statement:scopeStatement,evidenceIssuerHost:issuerHost},
        })});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Quote request failed");
      setResult(data);
    }catch(e){setError(e instanceof Error?e.message:"Quote request failed");}
    finally{setBusy(false);}
  };

  const purchase=async()=>{
    if(!result?.executable||!result.signature||!result.quote) return;
    setBusy(true);setError("");
    setTx("");setTransactionPhase("IDLE");setTransactionError("");
    try {
      if(!wallet.address)throw new Error("Wallet disconnected");
      const contract=configuredPoolAddress();
      if(!contract)throw new Error("USDC pool contract not configured");
      if(!window.ethereum)throw new Error("Injected wallet required");
      if(wallet.chainId!==84532)await wallet.switchToBase();
      const client=createWalletClient({account:wallet.address,chain:baseSepolia,transport:custom(window.ethereum)});
      const quote=quoteToAbi(result.quote);
      const allowance=await baseClient.readContract({
        address:BASE_USDC,abi:usdcAbi,functionName:"allowance",args:[wallet.address,contract],
      });
      if(allowance<quote.premium) {
        beginTransaction("USDC approval");
        const approval=await client.writeContract({
          address:BASE_USDC,abi:usdcAbi,functionName:"approve",
          args:[contract,quote.premium],account:wallet.address,chain:baseSepolia,
        });
        setTransactionHash(approval);setTransactionPhase("SUBMITTED");setTransactionPhase("CONFIRMING");
        const receipt=await baseClient.waitForTransactionReceipt({hash:approval});
        if(receipt.status!=="success")throw new Error("USDC approval transaction reverted");
      }
      beginTransaction("Policy purchase");
      const hash=await client.writeContract({
        address:contract,abi:poolsAbi,functionName:"purchase",
        args:[quote,result.signature],account:wallet.address,chain:baseSepolia,
      });
      setTransactionHash(hash);setTransactionPhase("SUBMITTED");setTransactionPhase("CONFIRMING");
      const receipt=await baseClient.waitForTransactionReceipt({hash});
      if(receipt.status!=="success")throw new Error("Policy purchase transaction reverted");
      setTx(hash);setTransactionPhase("CONFIRMED");
    }catch(e){
      const message=e instanceof Error?e.message:"Purchase failed";
      setTransactionError(message);setTransactionPhase(/revert/i.test(message)?"REVERTED":"RECOVERABLE_ERROR");setError(message);
    }
    finally{setBusy(false);}
  };
  return (
    <>
      <PageHeading eyebrow="ISSUE / WALLET-SIGNED POLICY" title="Get covered." subtitle="Configure a policy, inspect its signed terms and purchase using Circle USDC on Base Sepolia."/>
      <TestnetNotice text="Quote rates are deterministic protocol configuration for Base Sepolia only, not actuarial underwriting or real insurance coverage."/>
      <div className="form-layout">
        <div className="panel form-panel">
          <div className="form-block">
            <div className="form-block-title"><span>01</span> Choose a risk</div>
            <div className="field"><label htmlFor="risk">COVERAGE CATEGORY</label><select id="risk" value={risk} onChange={e=>{const id=Number(e.target.value);setRisk(id);setDays(Math.min(days,coverages[id].maxDurationDays));}}>{coverages.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <p className="field-hint">{selected.description}</p>
          </div>
          <div className="form-block">
            <div className="form-block-title"><span>02</span> Define exposure</div>
            <div className="field"><label htmlFor="cover-limit">MAXIMUM COVER LIMIT (USDC)</label><input className="input" id="cover-limit" type="number" min="100" max="250000" step="100" value={limit} onChange={e=>setLimit(Number(e.target.value))}/><input aria-label="Adjust coverage limit" className="slider" type="range" min="100" max="50000" step="100" value={Math.min(50000,limit)} onChange={e=>setLimit(Number(e.target.value))}/><div className="range-labels"><span>$100</span><span>$50,000</span></div></div>
            <div className="field"><label htmlFor="duration">POLICY PERIOD</label><select id="duration" value={days} onChange={e=>setDays(Number(e.target.value))}>{[7,14,30,45,60,90,120,180,365].filter(d=>d<=selected.maxDurationDays).map(d=><option key={d} value={d}>{d} days</option>)}</select></div>
          </div>
          <div className="form-block">
            <div className="form-block-title"><span>03</span> Ownership & beneficiary</div>
            <div className="field"><label>INSURED WALLET</label><input className="input" readOnly value={wallet.address||"Connect a wallet to continue"}/><span className="field-hint">The owner signs into COVRA. A separately authorized agent wallet may buy on its behalf.</span></div>
            <div className="field"><label htmlFor="beneficiary">PAYOUT BENEFICIARY (EVM ADDRESS)</label><input className="input" id="beneficiary" value={beneficiary} onChange={e=>setBeneficiary(e.target.value)} placeholder="0x..."/><span className="field-hint">The beneficiary is immutable after purchase. Double-check the address.</span></div>
          </div>
          <div className="form-block">
            <div className="form-block-title"><span>04</span> Freeze the insured exposure</div>
            <p className="field-hint">Only this specifically identified risk can produce a claim. These details are committed in the signed Base policy and checked against GenLayer evidence.</p>
            <div className="field"><label htmlFor="risk-subject">{subjectLabels[risk]}</label><input className="input" id="risk-subject" value={insuredSubject} onChange={e=>setInsuredSubject(e.target.value)} placeholder="Exact task, provider, agent, protocol, or operation identifier"/></div>
            <div className="field"><label htmlFor="risk-reference">{referenceLabels[risk]}</label><input className="input" id="risk-reference" value={referenceHash} onChange={e=>setReferenceHash(e.target.value)} placeholder="0x + 64 hexadecimal characters"/></div>
            <div className="field"><label htmlFor="risk-statement">BOUNDARY, TRIGGER AND MEASUREMENT METHOD</label><textarea id="risk-statement" value={scopeStatement} onChange={e=>setScopeStatement(e.target.value)} placeholder="Identify the covered obligation, observable trigger, exclusions and the agreed measurement method (minimum 24 characters)."/></div>
            <div className="field"><label htmlFor="risk-issuer">INDEPENDENT EVIDENCE ISSUER HOST</label><input className="input" id="risk-issuer" value={issuerHost} onChange={e=>setIssuerHost(e.target.value)} placeholder="verified-source.example.org"/><span className="field-hint">Issuer identity must also be approved by the verifier network. A hostname or evidence hash alone is not proof of truth.</span></div>
          </div>
          <div className="form-block" style={{marginBottom:8}}>
            <div className="form-block-title"><span>05</span> Review exclusions</div>
            {selected.exclusions.map(x=><div className="exclusion-row" key={x}><AlertTriangle size={16}/>{x}</div>)}
            <span className="field-hint">Policy terms digest: {canonicalTermsHash(risk).slice(0,16)}…</span>
          </div>
        </div>
        <aside>
          <div className="quote-summary">
            <div className="detail-label">YOUR TESTNET QUOTE</div>
            <h3>{selected.name}</h3>
            <div className="detail-label">ESTIMATED PREMIUM</div>
            <div className="quote-amount">{estimate?formatUsdc(estimate.premiumUsd):"—"}<small>USDC</small></div>
            <div className="quote-summary-row"><span>Maximum payout</span><strong>{formatUsdc(limit)}</strong></div>
            <div className="quote-summary-row"><span>Term</span><strong>{days} days</strong></div>
            <div className="quote-summary-row"><span>Underwriting pool</span><strong>Class 0{risk+1}</strong></div>
            <div className="quote-summary-row"><span>Network</span><strong>Base Sepolia</strong></div>
            <div className="quote-summary-row"><span>Evidence decision</span><strong>GenLayer Phase 2</strong></div>
            {!wallet.address&&<button className="primary-action" disabled={wallet.busy} onClick={()=>void wallet.connect().catch(()=>undefined)}><Wallet size={16}/> Connect wallet</button>}
            {wallet.address&&!wallet.authenticated&&<button className="primary-action" disabled={wallet.busy} onClick={()=>void wallet.signIn().catch(()=>undefined)}><LockKeyhole size={16}/> Sign in to issue policy</button>}
            {wallet.address&&<button className="primary-action" disabled={busy} onClick={preview}><ShieldCheck size={16}/>{busy?"Processing…":"Generate signed quote"}<ArrowRight size={16}/></button>}
            {result?.executable&&<button className="primary-action" disabled={busy} onClick={purchase}><CircleDollarSign size={16}/>{busy?"Confirming…":"Approve USDC & purchase"}</button>}
            <p>Quote expiry is short. Your wallet must approve the exact premium amount before purchasing. No unlimited token approvals are requested.</p>
          </div>
          {result&&!result.executable&&<div className="feedback"><Info size={14}/> Preview: {result.reason}</div>}
          {result?.executable&&!tx&&<div className="feedback"><CheckCircle2 size={15}/> A signed quote is ready. Confirm the transaction in your wallet before it expires.</div>}
          {transactionPhase!=="IDLE"&&<div className={`feedback ${transactionPhaseTone(transactionPhase)==="error"?"feedback-error":""}`} role={transactionPhaseTone(transactionPhase)==="error"?"alert":"status"} aria-live="polite">
            {transactionPhase==="CONFIRMED"?<CheckCircle2 size={16}/>:<Info size={16}/>} <strong>{transactionLabel}: {transactionPhaseLabel[transactionPhase]}.</strong>{" "}
            {transactionError&&<span>{transactionError}{" "}</span>}
            {transactionHash&&<a href={"https://sepolia.basescan.org/tx/"+transactionHash} target="_blank" rel="noreferrer">View receipt ↗</a>}
            {transactionPhase==="CONFIRMED"&&tx&&<><br/>The policy receipt is confirmed; it will appear in My Policies once the event indexer reconciles it.</>}
          </div>}
          {error&&<div className="feedback feedback-error">{error}</div>}
        </aside>
      </div>
    </>
  );
}
