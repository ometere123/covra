"use client";
import Link from "next/link";
import { Activity, ArrowRight, ArrowUpRight, Banknote, ExternalLink, Layers3, ShieldCheck, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { coverages, formatUsdc } from "@/lib/catalog";
import { formatMicroUsdc } from "@/lib/capital-history";
import { PageHeading, Panel, StatusTag, SyncNotice } from "@/components/ui";
import { useWallet } from "@/components/wallet-provider";

type Pool = {
  classId: number;
  name: string;
  assetsMicroUsdc: string;
  reservedMicroUsdc: string;
  paidMicroUsdc: string;
};
type TimelineEvent = { time: string; title: string; detail: string; status?: string; link?: string };

export default function Dashboard() {
  const { authenticated } = useWallet();
  const [pools, setPools] = useState<Pool[] | null>(null);
  const [poolState, setPoolState] = useState("LOADING");
  const [poolMessage, setPoolMessage] = useState("");
  const [policies, setPolicies] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [capitalEvents, setCapitalEvents] = useState<any[]>([]);
  const [accountState, setAccountState] = useState("SIGNED_OUT");

  useEffect(() => {
    void fetch("/api/pools", { cache: "no-store" }).then(async response => {
      const payload = await response.json();
      setPools(Array.isArray(payload.items) ? payload.items : []);
      setPoolState(String(payload.state || (response.ok ? "CONFIRMED" : "SYNCHRONIZATION_ERROR")));
      setPoolMessage(String(payload.message || payload.error || ""));
    }).catch(() => {
      setPools([]);
      setPoolState("SYNCHRONIZATION_ERROR");
      setPoolMessage("Base Sepolia pool state could not be read.");
    });
  }, []);

  useEffect(() => {
    if (!authenticated) {
      setPolicies([]);
      setClaims([]);
      setAccountState("SIGNED_OUT");
      return;
    }
    setAccountState("LOADING");
    void Promise.all([
      fetch("/api/policies", { cache: "no-store" }).then(r => r.json()),
      fetch("/api/claims", { cache: "no-store" }).then(r => r.json()),
      fetch("/api/activity", { cache: "no-store" }).then(r => r.json()),
    ]).then(([policyPayload, claimPayload, capitalPayload]) => {
      setPolicies(Array.isArray(policyPayload.items) ? policyPayload.items : []);
      setClaims(Array.isArray(claimPayload.items) ? claimPayload.items : []);
      setAccountState(policyPayload.state === "CONFIRMED" && claimPayload.state === "CONFIRMED" && capitalPayload.state === "CONFIRMED" ? "CONFIRMED" : String(policyPayload.state || claimPayload.state || capitalPayload.state || "SYNCHRONIZATION_ERROR"));
      setCapitalEvents(Array.isArray(capitalPayload.items) ? capitalPayload.items : []);
    }).catch(() => {
      setPolicies([]);
      setClaims([]);
      setAccountState("SYNCHRONIZATION_ERROR");
    });
  }, [authenticated]);

  const assets = pools?.reduce((sum, pool) => sum + Number(pool.assetsMicroUsdc) / 1e6, 0) ?? null;
  const reserved = pools?.reduce((sum, pool) => sum + Number(pool.reservedMicroUsdc) / 1e6, 0) ?? null;
  const paid = pools?.reduce((sum, pool) => sum + Number(pool.paidMicroUsdc) / 1e6, 0) ?? null;
  const utilization = assets !== null && assets > 0 && reserved !== null ? Math.round((reserved / assets) * 100) : null;
  const timeline: TimelineEvent[] = [
    ...policies.map(policy => ({ time: String(policy.created_at), title: "Base policy indexed", detail: String(policy.policy_id), link: policy.base_tx_hash ? `https://sepolia.basescan.org/tx/${policy.base_tx_hash}` : undefined })),
    ...claims.map(claim => ({ time: String(claim.created_at), title: "Claim state indexed", detail: String(claim.id), link: claim.base_lock_tx_hash ? `https://sepolia.basescan.org/tx/${claim.base_lock_tx_hash}` : undefined })),
    ...capitalEvents.map(event => ({ time: String(event.timestamp), title: String(event.title), detail: `${String(event.className)} · ${formatMicroUsdc(String(event.usdcAmountMicroUsdc))} · ${String(event.shares)} shares`, status: "Confirmed", link: String(event.explorerUrl) })),
  ].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 5);
  const displayedPolicies = policies.map(policy => ({
    id: String(policy.policy_id),
    risk: Number(policy.coverage_class),
    limit: Number(policy.cover_micro_usdc) / 1e6,
    status: new Date(policy.ends_at).getTime() > Date.now() ? "Active" : "Expired",
  }));

  return <>
    <PageHeading eyebrow="Overview / verified state" title="A precise view of risk." subtitle="Only reconciled Base Sepolia state and your authenticated account records appear here. Empty means no verified activity exists yet." action={{ label: "Get coverage", href: "/app/quote" }} />
    {!authenticated && <SyncNotice text="Connect your wallet and sign in to view owned policies, claims and activity. No account data is shown before authentication." />}
    {authenticated && accountState !== "CONFIRMED" && accountState !== "LOADING" && <SyncNotice text={accountState === "DATABASE_UNAVAILABLE" ? "The reconciled account index is not configured yet." : "Account state is waiting for synchronization."} />}
    {poolState !== "CONFIRMED" && <SyncNotice text={poolState === "LOADING"
      ? "Verifying the Base Sepolia pool and its chain bindings… no balances are shown yet."
      : poolMessage || "Base Sepolia pool state could not be verified; no balances are shown."} />}
    <div className="stat-grid">
      {[
        { label: "Pool capital", value: assets === null ? "—" : formatUsdc(assets), foot: "Verified Base Sepolia USDC", icon: Banknote },
        { label: "Reserved exposure", value: reserved === null ? "—" : formatUsdc(reserved), foot: "On-chain policy locks", icon: ShieldCheck },
        { label: "Capital utilization", value: utilization === null ? "—" : utilization + "%", foot: "Reserved against assets", icon: Layers3 },
        { label: "Settled claims", value: paid === null ? "—" : formatUsdc(paid), foot: "Pool settlement totals", icon: Activity },
      ].map(stat => <div className="stat-card" key={stat.label}><div className="stat-top"><span>{stat.label}</span><stat.icon size={18} strokeWidth={1.6} /></div><strong>{stat.value}</strong><small>{stat.foot}</small></div>)}
    </div>
    <div className="dashboard-grid">
      <Panel title="Exposure by coverage class" sub="Base state">
        <div className="live-coverage-list">
          {coverages.map(risk => {
            const pool = pools?.find(item => Number(item.classId) === risk.id);
            const ratio = pool && Number(pool.assetsMicroUsdc) > 0 ? Math.min(100, Math.round(Number(pool.reservedMicroUsdc) / Number(pool.assetsMicroUsdc) * 100)) : null;
            return <div className="risk-progress" key={risk.id}>
              <div className="risk-progress-label"><span className="risk-mini-icon">{String(risk.id + 1).padStart(2, "0")}</span>{risk.name}</div>
              <div className="risk-progress-track">{ratio !== null && <i style={{ width: ratio + "%" }} />}</div>
              <div className="risk-progress-value">{ratio === null ? "—" : ratio + "%"}</div>
            </div>;
          })}
          {poolState !== "CONFIRMED" && <p className="state-caption">No live pool measurements are available</p>}
        </div>
      </Panel>
      <Panel title="Recent account activity" action={{ label: "See activity", href: "/app/activity" }}>
        {!authenticated ? <div className="empty-state"><Wallet size={22} /><strong>Wallet required</strong><p>Sign in to inspect activity derived from your own indexed records.</p></div> : timeline.length ? <div className="activity-list">{timeline.map(event => <div className="activity-row" key={event.title + event.detail}><div className="activity-marker"><Activity size={15} /></div><div className="activity-main"><strong>{event.title}</strong><p>{event.detail}{event.status ? ` · ${event.status}` : ""}</p>{event.link && <a className="activity-link" href={event.link} target="_blank" rel="noreferrer">View transaction <ExternalLink size={12}/></a>}</div><span className="activity-time">{new Date(event.time).toLocaleString("en-GB")}</span></div>)}</div> : <div className="empty-state"><Activity size={22} /><strong>No indexed activity</strong><p>The timeline begins after a verified Base capital, policy or claim record is reconciled.</p></div>}
      </Panel>
    </div>
    <div className="dashboard-two">
      <Panel title="Owned policies" action={{ label: "All policies", href: "/app/policies" }}>
        {!authenticated ? <div className="empty-state"><strong>Sign in to view policies</strong><p>COVRA does not display another wallet's coverage records.</p></div> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Policy</th><th>Coverage</th><th>Limit</th><th>Status</th></tr></thead><tbody>{displayedPolicies.length ? displayedPolicies.slice(0, 4).map(policy => <tr key={policy.id}><td>{policy.id}</td><td>{coverages[policy.risk]?.name || "Unknown"}</td><td>{formatUsdc(policy.limit)}</td><td><StatusTag variant={policy.status === "Active" ? "verified" : "pending"}>{policy.status}</StatusTag></td></tr>) : <tr><td colSpan={4} className="table-empty">No verified policies</td></tr>}</tbody></table></div>}
      </Panel>
      <Panel title="Protocol boundary" sub="Source of truth">
        <div className="protocol-note"><div className="detail-label">NO FABRICATED STATE</div><h3>Every figure has a source</h3><p>Base Sepolia is authoritative for USDC, policies and settlement. Bradbury is authoritative for adjudication state. Supabase only reflects reconciled records.</p><Link href="/developers" className="secondary-action">Read the trust boundary <ArrowUpRight size={14} /></Link></div>
      </Panel>
    </div>
    <div className="feature-callout"><div><h3>Agents need bounded authority</h3><p>Issue scoped credentials and keep wallet permissions separate from settlement authority.</p></div><Link href="/app/agents">Configure agent access <ArrowRight size={15} /></Link></div>
  </>;
}
