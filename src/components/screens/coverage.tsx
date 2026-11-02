"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, AlertTriangle, DatabaseZap, ShieldCheck, Layers3 } from "lucide-react";
import { coverages } from "@/lib/catalog";
import { PageHeading } from "@/components/ui";

export default function CoverageScreen() {
  const params = useSearchParams();
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    const index = coverages.findIndex(c=>c.slug===params.get("risk"));
    if (index>=0) setSelected(index);
  }, [params]);
  const c = coverages[selected];
  return (
    <>
      <PageHeading eyebrow="PROTECTION / FIVE RISK CLASSES" title="Coverage, precisely defined." subtitle="Each product has its own evidence sources, exclusions, reserve ledger and intelligent adjudication policy." action={{ label:"Build a quote",href:"/app/quote" }}/>
      <div className="coverage-intro"><div><span className="detail-label">FIVE COVERAGE TYPES / ONE SYSTEM</span><h2>Risk without the guesswork.</h2><p>Choose an event category to inspect what is covered, what evidence matters and where the boundary sits.</p></div><div className="coverage-intro-aside"><span className="detail-label">SETTLEMENT NETWORK</span><strong>USDC on Base</strong><p>Funds remain in ring-fenced Base pools. Adjudication happens on Bradbury Phase 2.</p></div></div>
      <div className="coverage-selection">{coverages.map((risk,i)=><button key={risk.id} className={"coverage-choice "+(i===selected?"selected":"")} onClick={()=>setSelected(i)}><span className="choice-num">0{i+1} / 05</span><strong>{risk.name}</strong><span>{risk.signal}</span></button>)}</div>
      <div className="coverage-detail">
        <div className="panel"><span className="detail-label">Coverage class / 0{selected+1}</span><h2>{c.name}</h2><p>{c.description}</p><div className="detail-label" style={{marginTop:25}}>Typical covered events</div><ul className="list-clean">{c.examples.map(x=><li key={x}><CheckCircle2 size={15}/>{x}</li>)}</ul><div className="detail-label" style={{marginTop:22}}>Important exclusions</div><ul className="list-clean">{c.exclusions.map(x=><li key={x}><AlertTriangle size={15}/>{x}</li>)}</ul><Link className="primary-action" href={"/app/quote?risk="+c.slug}>Get a quote for this risk <ArrowUpRight size={16}/></Link></div>
        <div className="panel"><div className="claim-evidence"><DatabaseZap size={26}/><h3>Evidence standard</h3><p>Any contested payout must be backed by evidence appropriate to the covered event, not only a claimant's assertion.</p><ul className="list-clean">{c.evidence.map(x=><li key={x}><ShieldCheck size={15}/>{x}</li>)}</ul></div><div className="coverage-parameters"><div className="detail-label">Coverage parameters</div><div className="setting-line"><div><strong>Term duration</strong><span>Testnet product ceiling</span></div><strong>{c.maxDurationDays} days</strong></div><div className="setting-line"><div><strong>Settlement asset</strong><span>Native Circle USDC</span></div><strong>Base Sepolia</strong></div><div className="setting-line"><div><strong>Adjudication</strong><span>Verifiable external facts</span></div><strong>Bradbury Phase 2</strong></div><div className="setting-line"><div><strong>Dispute path</strong><span>One recorded appeal</span></div><strong>Available</strong></div><p className="muted-note">Pricing is deterministic testnet configuration only; this page does not constitute an insurance contract or an offer of coverage.</p></div></div>
      </div>
    </>
  );
}
