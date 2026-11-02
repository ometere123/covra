import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Landmark, Layers, ShieldCheck, CircleDollarSign } from "lucide-react";
import { Brand } from "@/components/brand";
import { WalletButton } from "@/components/wallet-button";
import { coverages } from "@/lib/catalog";
import { PoolAllocation } from "@/components/pool-allocation";

export default function UnderwritePage() {
  return (
    <div className="sub-page">
      <header className="sub-header container"><Brand/><nav><Link href="/"><ArrowLeft size={16}/> Back to home</Link></nav><WalletButton/></header>
      <main className="container sub-main">
        <div className="eyebrow">COVRA / UNDERWRITING TERMINAL</div>
        <div className="sub-hero"><div><h1>Capital, with<br/><em>clear boundaries.</em></h1><p>Fund a specific risk class with Base USDC. Each pool tracks its own available capital, reserved liabilities, premiums and paid claims.</p><Link className="button-primary" href="/app/pools">Inspect pool reserves <ArrowUpRight size={17}/></Link></div><div className="sub-hero-device"><span>Risk segregation</span><div><span className="dot-network"/> Five pools</div><strong>Capital <span>on Base</span></strong><strong>Decisions <span>on GenLayer</span></strong><div className="device-hash">No GEN escrow / no synthetic deposit</div></div></div>
        <div className="underwrite-benefits">{[
          { icon: Layers, title: "Five distinct pools", desc: "Choose which insured risk receives your capital." },
          { icon: Landmark, title: "Visible utilization", desc: "Withdrawal availability respects reserved coverage obligations." },
          { icon: ShieldCheck, title: "Bounded claims", desc: "A policy cannot pay above its approved coverage limit." },
          { icon: CircleDollarSign, title: "Real settlement asset", desc: "Testnet Circle USDC on Base Sepolia." },
        ].map(x=><div key={x.title}><x.icon size={25}/><strong>{x.title}</strong><p>{x.desc}</p></div>)}</div>
        <div className="section-topline"><span>ALLOCATE CAPITAL</span><span>BASE SEPOLIA / TESTNET</span></div>
        <PoolAllocation/>
        <div className="underwrite-footnote"><strong>Insurance capital is genuinely at risk.</strong> This is a testnet demonstration. Before any mainnet underwriter deposits are accepted, COVRA needs verified actuarial pricing, licensed underwriting arrangements where required, independent security audits and an adequately governed attestation network.</div>
        <div className="underwrite-risk-list">{coverages.map(c=><div key={c.id}><span>0{c.id+1}</span><strong>{c.name}</strong><span>{c.signal}</span></div>)}</div>
      </main>
    </div>
  );
}
