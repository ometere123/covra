import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Code2, Terminal, ShieldCheck, Bot, Network, KeyRound } from "lucide-react";
import { Brand } from "@/components/brand";
import { WalletButton } from "@/components/wallet-button";

const tools = [
  { method: "GET", path: "/api/catalog", description: "Discover the five insured risks and approved testnet terms." },
  { method: "POST", path: "/api/quotes", description: "Obtain a quote; receive a signed EIP-712 quote when configured." },
  { method: "GET", path: "/api/policies", description: "Read owned on-chain policies mirrored by the Base indexer." },
  { method: "POST", path: "/api/claims", description: "Create a claim intake record tied to a real indexed Base policy." },
  { method: "GET", path: "/api/pools", description: "Inspect reserved and available Base USDC by risk class." },
  { method: "GET", path: "/api/health", description: "Read deployment readiness without exposing secrets." },
];
export default function DevelopersPage() {
  return (
    <div className="sub-page">
      <header className="sub-header container"><Brand/><nav><Link href="/"><ArrowLeft size={16}/> Back to home</Link></nav><WalletButton/></header>
      <main className="container sub-main">
        <div className="eyebrow">COVRA / DEVELOPER PROTOCOL</div>
        <div className="sub-hero"><div><h1>Coverage is<br/><em>an agent tool.</em></h1><p>Build protection into an autonomous workflow through explicit owner permissions, scoped bearer credentials and human-verifiable policy terms.</p><Link className="button-primary" href="/app/agents">Configure agent access <ArrowUpRight size={17}/></Link></div><div className="sub-hero-device"><span>Protocol status</span><div><span className="dot-network"/> Testnet development</div><strong>GenLayer <span>4221</span></strong><strong>Base USDC <span>84532</span></strong><div className="device-hash">Decisions / reserves / settlements</div></div></div>
        <div className="dev-features">{[
          { icon: Bot, title: "Agent native", text: "Issue API credentials with explicit scopes and expiry. An agent never gains an unlimited wallet allowance." },
          { icon: ShieldCheck, title: "Owner controlled", text: "The underlying Base pool enforces spending caps on delegated purchase wallets." },
          { icon: Network, title: "Chain separated", text: "GenLayer owns evidence adjudication. Base owns actual USDC and settlement checks." },
          { icon: KeyRound, title: "Revocable", text: "Revoke API keys immediately; revoke Base wallet delegation independently." },
        ].map(f => <div key={f.title}><f.icon size={23}/><h3>{f.title}</h3><p>{f.text}</p></div>)}</div>
        <div className="section-topline"><span>API REFERENCE</span><span>BASE URL / YOUR DEPLOYMENT DOMAIN</span></div>
        <h2 className="dev-subtitle">An API agents can reason with.</h2>
        <div className="api-list">{tools.map(api => <div key={api.path}><span className={"api-method " + (api.method === "POST" ? "method-post" : "")}>{api.method}</span><code>{api.path}</code><p>{api.description}</p></div>)}</div>
        <div className="code-example"><div className="code-example-header"><Terminal size={17}/> AGENT REQUEST EXAMPLE <span>HTTPS / JSON</span></div><pre><code>{'curl -X POST https://your-covra-domain/api/quotes \\\n  -H "Authorization: Bearer cvra_..." \\\n  -H "Content-Type: application/json" \\\n  -d \'{ "coverageClass": 0, "coverageUsd": 5000, ... }\''}</code></pre></div>
        <p className="dev-caution">Credentials must be obtained by an authenticated wallet owner. Code issuance does not grant signing authority or custody of funds. See README and the architecture documents in the ZIP for contract and API details.</p>
      </main>
    </div>
  );
}
