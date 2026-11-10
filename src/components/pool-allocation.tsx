"use client";
import { useEffect, useState } from "react";
import { createWalletClient, custom, parseUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { ArrowUpRight, CircleDollarSign, Landmark, Info, CheckCircle2 } from "lucide-react";
import { baseClient, BASE_USDC, configuredPoolAddress, poolsAbi, usdcAbi } from "@/lib/chain";
import { coverages, formatUsdc } from "@/lib/catalog";
import { useWallet } from "./wallet-provider";
import { EmptyState, SyncNotice } from "./ui";

export type PoolRow = {
  classId: number; name: string;
  assetsMicroUsdc: string; reservedMicroUsdc: string;
  totalShares: string; paidMicroUsdc: string; premiumsWrittenMicroUsdc: string;
};

export function PoolAllocation({ showIntro = true }: { showIntro?: boolean }) {
  const wallet = useWallet();
  const [items,setItems]=useState<PoolRow[]>([]);
  const [state,setState]=useState("LOADING");
  const [message,setMessage]=useState("");
  const [risk,setRisk]=useState(0);
  const [amount,setAmount]=useState(250);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [tx,setTx]=useState("");
  const [withdrawShares,setWithdrawShares]=useState("");
  const refresh=()=>{
    void fetch("/api/pools",{cache:"no-store"}).then(r=>r.json()).then(r=>{
      setItems(Array.isArray(r.items)?r.items:[]);
      setState(String(r.state||"SYNCHRONIZATION_ERROR"));
      setMessage(String(r.message||r.error||""));
    }).catch(()=>{setItems([]);setState("SYNCHRONIZATION_ERROR");setMessage("Base Sepolia pool state could not be read.");});
  };
  useEffect(refresh,[]);
  const deposit=async()=>{
    setError("");setTx("");setBusy(true);
    try{
      const contract=configuredPoolAddress();
      if(!contract||!wallet.address||!window.ethereum)throw new Error("Connect a wallet and configure the deployed Base pool contract.");
      if(amount<=0||amount>100000)throw new Error("Deposit amount must be between 1 and 100,000 test USDC.");
      if(wallet.chainId!==84532)await wallet.switchToBase();
      const client=createWalletClient({account:wallet.address,chain:baseSepolia,transport:custom(window.ethereum)});
      const micro=parseUnits(amount.toFixed(2),6);
      const balance=await baseClient.readContract({address:BASE_USDC,abi:usdcAbi,functionName:"balanceOf",args:[wallet.address]});
      if(balance<micro)throw new Error("Insufficient Base Sepolia test USDC.");
      const allowance=await baseClient.readContract({address:BASE_USDC,abi:usdcAbi,functionName:"allowance",args:[wallet.address,contract]});
      if(allowance<micro){
        const approve=await client.writeContract({account:wallet.address,chain:baseSepolia,address:BASE_USDC,abi:usdcAbi,functionName:"approve",args:[contract,micro]});
        const receipt=await baseClient.waitForTransactionReceipt({hash:approve});
        if(receipt.status!=="success")throw new Error("USDC approval reverted");
      }
      const hash=await client.writeContract({account:wallet.address,chain:baseSepolia,address:contract,abi:poolsAbi,functionName:"deposit",args:[risk,micro]});
      const receipt=await baseClient.waitForTransactionReceipt({hash});
      if(receipt.status!=="success")throw new Error("Pool deposit reverted");
      setTx(hash);refresh();
    }catch(e){setError(e instanceof Error?e.message:"Deposit failed");}
    finally{setBusy(false);}
  };
  const withdraw=async()=>{
    setError("");setTx("");setBusy(true);
    try {
      const contract=configuredPoolAddress();
      if(!contract||!wallet.address||!window.ethereum)throw new Error("Connect wallet and configure deployed pools.");
      const shares=BigInt(withdrawShares);
      if(shares<=0n)throw new Error("Enter a positive exact share count.");
      if(wallet.chainId!==84532)await wallet.switchToBase();
      const client=createWalletClient({account:wallet.address,chain:baseSepolia,transport:custom(window.ethereum)});
      const availableShares=await baseClient.readContract({address:contract,abi:poolsAbi,functionName:"sharesOf",args:[risk,wallet.address]});
      if(shares>availableShares)throw new Error("You do not own that many shares.");
      const hash=await client.writeContract({account:wallet.address,chain:baseSepolia,address:contract,abi:poolsAbi,functionName:"withdraw",args:[risk,shares]});
      const receipt=await baseClient.waitForTransactionReceipt({hash});
      if(receipt.status!=="success")throw new Error("Withdrawal reverted; capital may be reserved.");
      setTx(hash);refresh();
    }catch(e){setError(e instanceof Error?e.message:"Withdrawal failed");}
    finally{setBusy(false);}
  };
  const ready=state==="CONFIRMED"&&items.length===5;
  return (
    <>
      {state!=="CONFIRMED"&&<SyncNotice text={message||"Base Sepolia pool state is awaiting deployment or synchronization. No balances are shown."}/>} 
      {showIntro&&<div className="panel pool-intro"><div className="detail-label">Capital accounting</div><h3>A reserve for every risk</h3><p>Five independent underwriting ledgers; active policy limits reduce freely withdrawable capital until claims settle or the claim window expires.</p></div>}
      <div className="pool-grid">{items.length?items.map(p=>{
        const assets=Number(p.assetsMicroUsdc)/1e6;
        const reserved=Number(p.reservedMicroUsdc)/1e6;
        const ratio=assets>0?Math.min(100,Math.round(reserved/assets*100)):0;
        return <div className="pool-card" key={p.classId}><span className="pool-card-number">POOL / 0{p.classId+1}</span><h3>{p.name}</h3><strong>{formatUsdc(assets)}</strong><div className="pool-utilization"><span style={{width:ratio+"%"}}/></div><small><span>{ratio}% reserved</span><span>{formatUsdc(assets-reserved)} free</span></small></div>;
      }):<div className="pool-empty"><EmptyState title="No verified pool balances" text="Deploy the Base Sepolia pool contract and run the reconciler before allocating capital."/></div>}</div>
      <div className="form-layout pool-form-layout">
        <div className="panel form-panel">
          <div className="form-block-title"><span>01</span> Capital allocation</div>
          <div className="field"><label htmlFor="pool-risk">RISK POOL</label><select id="pool-risk" value={risk} onChange={e=>setRisk(Number(e.target.value))}>{coverages.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label htmlFor="pool-amount">TEST USDC TO DEPOSIT</label><input id="pool-amount" type="number" inputMode="decimal" step="0.01" className="input" min={1} max={100000} value={amount} onChange={e=>setAmount(Number(e.target.value))} aria-describedby="pool-deposit-hint"/></div>
          <div id="pool-deposit-hint" className="field-hint">Deposits mint non-transferable pro-rata accounting shares. Withdrawals cannot exceed unreserved capital. This product does not promise principal protection or guaranteed returns.</div>
          {!wallet.address&&<button type="button" className="secondary-action pool-wallet-action" disabled={busy||wallet.busy} onClick={()=>void wallet.connect().catch(()=>undefined)}><CircleDollarSign size={15}/>{wallet.busy?"Opening wallet…":"Connect wallet to continue"}</button>}
          {wallet.address&&wallet.chainId!==84532&&<button type="button" className="secondary-action pool-wallet-action" disabled={busy||wallet.busy} onClick={()=>void wallet.switchToBase().catch(()=>undefined)}>Switch to Base Sepolia <ArrowUpRight size={14}/></button>}
          {!ready&&<div className="field-hint pool-readiness">Pool balances are not confirmed yet; deposits remain disabled until Base Sepolia synchronization is healthy.</div>}
          <button type="button" className="primary-action pool-action" disabled={busy||!ready||!wallet.address||wallet.chainId!==84532} onClick={deposit}><CircleDollarSign size={15}/>{busy?"Waiting for wallet…":"Approve & deposit test USDC"}<ArrowUpRight size={14}/></button>
        </div>
        <aside className="panel form-panel">
          <div className="form-block-title"><span>02</span> Exit position</div>
          <div className="field"><label htmlFor="share-amount">SHARES TO WITHDRAW (RAW INTEGER)</label><input className="input" id="share-amount" placeholder="Exact shares" value={withdrawShares} onChange={e=>setWithdrawShares(e.target.value)}/><span className="field-hint">Share values are raw on-chain units. A future audited release will display them with precision-aware conversions.</span></div>
          <button type="button" className="secondary-action" disabled={busy||!ready||!wallet.address||wallet.chainId!==84532} onClick={withdraw}>Request withdrawal <ArrowUpRight size={14}/></button>
          <div className="feedback pool-withdraw-note"><Info size={15}/> Withdrawing while policies are active may be limited by reserved liabilities.</div>
        </aside>
      </div>
      {error&&<div className="feedback feedback-error">{error}</div>}
      {wallet.error&&<div className="feedback feedback-error" role="alert">{wallet.error}</div>}
      {tx&&<div className="feedback"><CheckCircle2 size={15}/> Transaction confirmed. <a href={"https://sepolia.basescan.org/tx/"+tx} target="_blank" rel="noreferrer">Inspect on Base Sepolia ↗</a></div>}
    </>
  );
}
