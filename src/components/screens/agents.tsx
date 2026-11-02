"use client";
import { useEffect, useState } from "react";
import { createWalletClient, custom, parseUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { Bot, KeyRound, ShieldCheck, Clock, Copy, Trash2, LockKeyhole, ArrowUpRight, PlugZap } from "lucide-react";
import { PageHeading, Panel, EmptyState } from "@/components/ui";
import { useWallet } from "@/components/wallet-provider";
import { baseClient, configuredPoolAddress, poolsAbi } from "@/lib/chain";
import { configuredAdjudicator,writeBradburyAction } from "@/lib/bradbury-client";

export default function AgentsScreen() {
  const wallet=useWallet();
  const [agents,setAgents]=useState<any[]>([]);
  const [label,setLabel]=useState("Research Executor");
  const [scope,setScope]=useState("quote:issue");
  const [secret,setSecret]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [delegate,setDelegate]=useState("");
  const [maxPremium,setMaxPremium]=useState(100);
  const [days,setDays]=useState(14);
  const reload=()=>{
    if(!wallet.authenticated)return;
    void fetch("/api/agents",{cache:"no-store"}).then(r=>r.json()).then(r=>{if(r.items)setAgents(r.items);}).catch(()=>undefined);
  };
  useEffect(reload,[wallet.authenticated]);
  const issue=async()=>{
    setBusy(true);setError("");setNotice("");setSecret("");
    try{
      const res=await fetch("/api/agents",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({label,scopes:[scope],expiresInDays:30,maxDailyRequests:500})});
      const json=await res.json();
      if(!res.ok)throw new Error(json.error||"Unable to issue agent credential");
      setSecret(json.secret);setNotice("Credential created. Copy it now; only its hash is stored.");reload();
    }catch(e){setError(e instanceof Error?e.message:"Credential issue failed");}
    finally{setBusy(false);}
  };
  const revoke=async(id:string)=>{
    if(!confirm("Revoke this API credential? This does not revoke separate on-chain wallet permissions."))return;
    const res=await fetch("/api/agents?id="+encodeURIComponent(id),{method:"DELETE"});
    if(res.ok){setNotice("API key revoked.");reload();}
    else setError("Unable to revoke credential.");
  };
  const authorizeDelegate=async()=>{
    setBusy(true);setError("");setNotice("");
    try {
      const addr=configuredPoolAddress();
      if(!wallet.address||!window.ethereum||!addr)throw new Error("Connect a wallet and configure the Base pool contract.");
      if(!/^0x[0-9a-fA-F]{40}$/.test(delegate))throw new Error("Enter a valid agent wallet address");
      if(maxPremium<=0||days<1||days>365)throw new Error("Invalid maximum premium or expiry.");
      if(wallet.chainId!==84532)await wallet.switchToBase();
      const client=createWalletClient({account:wallet.address,chain:baseSepolia,transport:custom(window.ethereum)});
      const hash=await client.writeContract({
        account:wallet.address,chain:baseSepolia,address:addr,abi:poolsAbi,
        functionName:"authorizeAgent",
        args:[delegate as `0x${string}`,parseUnits(maxPremium.toFixed(2),6),BigInt(Math.floor(Date.now()/1000)+days*86400)],
      });
      const receipt=await baseClient.waitForTransactionReceipt({hash});
      if(receipt.status!=="success")throw new Error("Authorization reverted");
      setNotice("Base delegation authorized. Transaction: "+hash);
    }catch(e){setError(e instanceof Error?e.message:"Delegation failed");}
    finally{setBusy(false);}
  };
  const revokePurchaseDelegate=async()=>{
    setBusy(true);setError("");setNotice("");
    try {
      const pool=configuredPoolAddress();
      if (!wallet.address||!window.ethereum||!pool||!/^0x[0-9a-fA-F]{40}$/.test(delegate))
        throw new Error("Connect the owner wallet and enter a valid agent address");
      if (wallet.chainId!==84532) await wallet.switchToBase();
      const client=createWalletClient({account:wallet.address,chain:baseSepolia,transport:custom(window.ethereum)});
      const hash=await client.writeContract({address:pool,abi:poolsAbi,functionName:"revokeAgent",
        args:[delegate as `0x${string}`],account:wallet.address,chain:baseSepolia});
      if ((await baseClient.waitForTransactionReceipt({hash})).status!=="success") throw new Error("Revocation reverted");
      setNotice("Purchase delegation revoked: "+hash);
    }catch(e){setError(e instanceof Error?e.message:"Revocation failed");}
    finally{setBusy(false);}
  };
  const setClaimDelegation=async(enabled:boolean)=>{
    setBusy(true);setError("");setNotice("");
    try {
      const pool=configuredPoolAddress();
      const adjudicator=configuredAdjudicator();
      if (!wallet.address||!window.ethereum||!pool||!adjudicator||!/^0x[0-9a-fA-F]{40}$/.test(delegate))
        throw new Error("Both contracts, owner wallet and agent address must be configured");
      if (wallet.chainId!==84532) await wallet.switchToBase();
      const client=createWalletClient({account:wallet.address,chain:baseSepolia,transport:custom(window.ethereum)});
      const baseHash=await client.writeContract({address:pool,abi:poolsAbi,functionName:"authorizeClaimAgent",
        args:[delegate as `0x${string}`,BigInt(enabled?Math.floor(Date.now()/1000)+days*86400:0)],account:wallet.address,chain:baseSepolia});
      if ((await baseClient.waitForTransactionReceipt({hash:baseHash})).status!=="success")
        throw new Error("Base claim permission transaction reverted");
      const bradbury=await writeBradburyAction(window.ethereum,wallet.address,adjudicator,
        "authorize_case_agent",[delegate,enabled?Math.floor(Date.now()/1000)+days*86400:0]);
      setNotice((enabled?"Claim delegation enabled on both chains. ":"Claim delegation revoked on both chains. ")+
        "Base: "+baseHash+" · Bradbury: "+bradbury.txHash);
    }catch(e){setError(e instanceof Error?e.message:"Claim delegation failed; CHECK BOTH CHAINS because the first transaction may have succeeded.");}
    finally{setBusy(false);}
  };
  return <>
    <PageHeading eyebrow="AGENTS / DELEGATE WITH LIMITS" title="Autonomy, under control." subtitle="Give agents the narrow API and wallet permissions they need. Every delegation is limited and can be revoked."/>
    <div className="agent-card-grid">
      {[
        {icon:Bot,title:"Programmatic coverage",text:"An agent can discover risks, obtain a quote and read its owner's policy records.",note:"MACHINE-READABLE API"},
        {icon:KeyRound,title:"Scoped credentials",text:"Issue an expiring key with only specific API capabilities. Secret material is shown once.",note:"REVOCABLE AUTHORITY"},
        {icon:ShieldCheck,title:"On-chain guardrails",text:"Actual Base purchases require a separate owner-signed delegation with a fixed premium cap.",note:"CONTRACT-ENFORCED LIMITS"},
      ].map(x=><div className="agent-card" key={x.title}><x.icon size={24}/><strong>{x.title}</strong><p>{x.text}</p><span>{x.note}</span></div>)}
    </div>
    <div className="dashboard-two">
      <div className="panel form-panel">
        <div className="form-block-title"><span>01</span> Create scoped API access</div>
        <div className="field"><label htmlFor="agent-label">AGENT LABEL</label><input id="agent-label" className="input" value={label} onChange={e=>setLabel(e.target.value)}/></div>
        <div className="field"><label htmlFor="agent-scope">CAPABILITY</label><select id="agent-scope" value={scope} onChange={e=>setScope(e.target.value)}><option value="quote:read">Read coverage information</option><option value="quote:issue">Request signed quotes</option><option value="policy:read">Read owned policies</option><option value="claim:read">Read owned claims</option><option value="claim:issue">Create claim intake (Base authorization still required)</option></select></div>
        <button className="primary-action" disabled={!wallet.authenticated||busy} onClick={issue}><KeyRound size={14}/> Issue expiring API key <ArrowUpRight size={14}/></button>
        {!wallet.authenticated&&<p className="field-hint" style={{marginTop:15}}>Connect and sign in to issue keys. You need the database and AGENT_API_KEY_PEPPER.</p>}
        {secret&&<div className="key-result"><strong>ONE-TIME SECRET · STORE PRIVATELY</strong><code>{secret}</code><button onClick={()=>void navigator.clipboard.writeText(secret)}><Copy size={13}/> Copy key</button></div>}
      </div>
      <div className="panel form-panel">
        <div className="form-block-title"><span>02</span> Authorize an on-chain agent wallet</div>
        <div className="field"><label htmlFor="agent-address">AGENT WALLET ADDRESS</label><input id="agent-address" className="input" value={delegate} onChange={e=>setDelegate(e.target.value)} placeholder="0x..."/></div>
        <div className="field-grid"><div className="field"><label htmlFor="agent-premium">TOTAL PREMIUM CAP (USDC)</label><input id="agent-premium" type="number" min={1} value={maxPremium} onChange={e=>setMaxPremium(Number(e.target.value))} className="input"/></div><div className="field"><label htmlFor="agent-days">EXPIRES AFTER (DAYS)</label><input id="agent-days" type="number" min={1} max={365} value={days} onChange={e=>setDays(Number(e.target.value))} className="input"/></div></div>
        <button className="secondary-action" disabled={!wallet.address||busy||!configuredPoolAddress()} onClick={authorizeDelegate}><LockKeyhole size={15}/> Authorize on Base Sepolia <ArrowUpRight size={14}/></button>
        <button className="secondary-action" disabled={!wallet.address||busy||!configuredPoolAddress()} onClick={revokePurchaseDelegate}><Trash2 size={15}/> Revoke Base purchase authority</button>
        <button className="secondary-action" disabled={!wallet.address||busy||!configuredAdjudicator()} onClick={()=>void setClaimDelegation(true)}><ShieldCheck size={15}/> Authorize claim agent on Base + Bradbury</button>
        <button className="secondary-action" disabled={!wallet.address||busy||!configuredAdjudicator()} onClick={()=>void setClaimDelegation(false)}><Trash2 size={15}/> Revoke claim agent on both chains</button>
        <p className="field-hint" style={{marginTop:16}}>API, purchasing and claims authority are distinct and independently revocable. Claim delegation needs two confirmed chain transactions; a partial failure must be reconciled manually. Agents never obtain pool-withdrawal authority.</p>
      </div>
    </div>
    {notice&&<div className="feedback">{notice}</div>}
    {error&&<div className="feedback feedback-error">{error}</div>}
    <div className="panel" style={{marginTop:19}}><div className="panel-header"><strong>Your issued API credentials</strong><span>PRIVATE KEY MATERIAL NOT RETAINED</span></div>
      {agents.length?<div className="data-table-wrap"><table className="data-table"><thead><tr><th>LABEL</th><th>SCOPES</th><th>EXPIRES</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{agents.map(a=><tr key={a.id}><td>{a.label}</td><td>{(a.scopes||[]).join(", ")}</td><td className="table-muted">{new Date(a.expires_at).toLocaleDateString("en-GB")}</td><td>{a.revoked_at?"Revoked":"Active"}</td><td>{!a.revoked_at&&<button className="secondary-action" onClick={()=>void revoke(a.id)}><Trash2 size={13}/> Revoke</button>}</td></tr>)}</tbody></table></div>:
      <EmptyState title="No API credentials yet" text="Issue a scoped credential above, then store it securely in your agent's environment."/>}
    </div>
  </>;
}
