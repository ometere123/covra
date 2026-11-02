"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FileCheck2 } from "lucide-react";
import { coverages, formatUsdc } from "@/lib/catalog";
import { useWallet } from "@/components/wallet-provider";
import { EmptyState, PageHeading, Panel, StatusTag, SyncNotice } from "@/components/ui";

export default function PoliciesScreen() {
  const { authenticated } = useWallet();
  const [items, setItems] = useState<any[]>([]);
  const [state, setState] = useState("SIGNED_OUT");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!authenticated) {
      setItems([]);
      setState("SIGNED_OUT");
      return;
    }
    setState("LOADING");
    void fetch("/api/policies", { cache: "no-store" }).then(async response => {
      const payload = await response.json();
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setState(String(payload.state || (response.ok ? "CONFIRMED" : "SYNCHRONIZATION_ERROR")));
      setMessage(String(payload.message || payload.error || ""));
    }).catch(() => {
      setItems([]);
      setState("SYNCHRONIZATION_ERROR");
      setMessage("The reconciled policy index could not be reached.");
    });
  }, [authenticated]);

  const totalExposure = items.reduce((sum, item) => sum + Number(item.cover_micro_usdc) / 1e6, 0);
  const totalPremium = items.reduce((sum, item) => sum + Number(item.premium_micro_usdc) / 1e6, 0);
  return <>
    <PageHeading eyebrow="Policies / reconciled records" title="Your coverage ledger." subtitle="This register contains only policies indexed from confirmed Base Sepolia events for the connected wallet." action={{ label: "Get new coverage", href: "/app/quote" }} />
    {!authenticated && <SyncNotice text="Connect and sign in to inspect a wallet-owned policy register." />}
    {authenticated && state !== "CONFIRMED" && state !== "LOADING" && <SyncNotice text={message || "Policy records are awaiting reconciliation."} />}
    <div className="stat-grid stat-grid-three">
      {[
        { label: "Policies in view", value: authenticated ? String(items.length) : "—", foot: "Confirmed Base events" },
        { label: "Covered exposure", value: authenticated ? formatUsdc(totalExposure) : "—", foot: "Sum of indexed limits" },
        { label: "Premiums paid", value: authenticated ? formatUsdc(totalPremium) : "—", foot: "Indexed USDC amounts" },
      ].map(item => <div className="stat-card" key={item.label}><div className="stat-top"><span>{item.label}</span><FileCheck2 size={18} /></div><strong>{item.value}</strong><small>{item.foot}</small></div>)}
    </div>
    <Panel title="Policy register" sub="Base Sepolia / reconciled">
      {!authenticated ? <EmptyState title="No account selected" text="Connect a wallet and sign in to load owned policies." action={{ label: "Connect wallet", href: "/app" }} /> : items.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Policy ID</th><th>Owner</th><th>Coverage</th><th>Limit</th><th>Premium</th><th>Expiry</th><th>Status</th></tr></thead><tbody>{items.map(item => { const active = new Date(item.ends_at).getTime() > Date.now(); return <tr key={item.policy_id}><td title={item.policy_id}>{String(item.policy_id).slice(0, 18)}…</td><td>{String(item.owner_wallet).slice(0, 7)}…{String(item.owner_wallet).slice(-5)}</td><td>{coverages[Number(item.coverage_class)]?.name || "Unknown"}</td><td>{formatUsdc(Number(item.cover_micro_usdc) / 1e6)}</td><td>{formatUsdc(Number(item.premium_micro_usdc) / 1e6)}</td><td className="table-muted">{new Date(item.ends_at).toLocaleDateString("en-GB")}</td><td><StatusTag variant={active ? "verified" : "pending"}>{active ? "Active" : "Expired"}</StatusTag></td></tr>; })}</tbody></table></div> : <EmptyState title="No verified policies" text={state === "CONFIRMED" ? "No Base Sepolia policy purchase has been indexed for this wallet." : "The policy register will appear after the indexer and database are configured."} action={{ label: "Get coverage", href: "/app/quote" }} />}
    </Panel>
    <div className="feature-callout"><div><h3>Need to report a covered incident?</h3><p>Claims begin from an indexed policy and remain subject to evidence and finality checks.</p></div><Link href="/app/claims">Open claims desk <ArrowUpRight size={15} /></Link></div>
  </>;
}
