"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, ShieldCheck, Activity, ExternalLink, CheckCircle2, Info } from "lucide-react";
import { useWallet } from "@/components/wallet-provider";
import { PageHeading, Panel, StatusTag } from "@/components/ui";

type Health = { status:string;mode:string;configured:Record<string,boolean> };

export default function SettingsScreen() {
  const wallet=useWallet();
  const [health,setHealth]=useState<Health|null>(null);
  useEffect(()=>{void fetch("/api/health",{cache:"no-store"}).then(r=>r.json()).then(setHealth).catch(()=>undefined);},[]);
  return <>
    <PageHeading eyebrow="WORKSPACE / CONFIGURATION" title="Environment & access." subtitle="Understand which systems are connected and what remains to be supplied in your local environment."/>
    <div className="dashboard-two">
      <Panel title="Account security" sub="SELF-CUSTODIAL">
        <div style={{padding:"3px 24px 22px"}}>
          <div className="setting-line"><div><strong>Connected wallet</strong><span>Injected EIP-1193 account</span></div><code>{wallet.address?wallet.address.slice(0,9)+"…"+wallet.address.slice(-5):"Not connected"}</code></div>
          <div className="setting-line"><div><strong>Signed-in session</strong><span>7-day HTTP-only JWT cookie</span></div><StatusTag variant={wallet.authenticated?"verified":"pending"}>{wallet.authenticated?"Verified":"Not signed in"}</StatusTag></div>
          <div className="setting-line"><div><strong>Current wallet network</strong><span>Financial transactions require Base Sepolia</span></div><span>{wallet.chainId||"Unknown"}</span></div>
          <div className="setting-line"><div><strong>Secret custody</strong><span>Keys are never exposed by the UI.</span></div><ShieldCheck size={20}/></div>
        </div>
      </Panel>
      <Panel title="Deployment readiness" sub="LIVE ENV CHECK">
        <div style={{padding:"3px 24px 22px"}}>
          {health?Object.entries(health.configured).map(([key,ready])=><div className="setting-line" key={key}><div><strong>{key.replaceAll(/([A-Z])/g," $1")}</strong><span>{ready?"Configuration present":"Awaiting environment values"}</span></div><StatusTag variant={ready?"verified":"pending"}>{ready?"Ready":"Pending"}</StatusTag></div>):<div className="empty-state">Checking runtime configuration…</div>}
        </div>
      </Panel>
    </div>
    <div className="panel" style={{padding:28,marginTop:19}}>
      <div className="detail-label">NETWORKS / NO MAINNET FUNDS</div>
      <div className="setting-line"><div><strong>GenLayer Bradbury Phase 2</strong><span>Chain 4221 · Intelligent Contract decisions</span></div><a className="secondary-action" href="https://scan.bradbury.genlayer.com" target="_blank" rel="noreferrer">Explorer <ExternalLink size={13}/></a></div>
      <div className="setting-line"><div><strong>Base Sepolia</strong><span>Chain 84532 · Circle USDC (6 decimals)</span></div><a className="secondary-action" href="https://sepolia.basescan.org" target="_blank" rel="noreferrer">Explorer <ExternalLink size={13}/></a></div>
      <div className="setting-line"><div><strong>Current release posture</strong><span>No legal underwriting license, capital solvency or audit assumed</span></div><StatusTag variant="pending">Testnet only</StatusTag></div>
      <div className="feedback"><Info size={15}/> Configured services and onchain deployments are separate release gates. Read the included SECURITY.md and LIVE_GATES.md documents before operating with real funds.</div>
    </div>
  </>;
}
