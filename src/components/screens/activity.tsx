"use client";
import { useEffect, useState } from "react";
import { Activity, CheckCircle2, Clock3, Layers3 } from "lucide-react";
import { useWallet } from "@/components/wallet-provider";
import { PageHeading, SyncNotice, Panel, EmptyState } from "@/components/ui";

type EventRow = { time: string; title: string; detail: string; status: string };

export default function ActivityScreen() {
  const wallet = useWallet();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [state, setState] = useState("SIGNED_OUT");
  useEffect(() => {
    if (!wallet.authenticated) {
      setEvents([]);
      setState("SIGNED_OUT");
      return;
    }
    setState("LOADING");
    void Promise.all([
      fetch("/api/policies", { cache: "no-store" }).then(r => r.json()),
      fetch("/api/claims", { cache: "no-store" }).then(r => r.json()),
    ]).then(([policies, claims]) => {
      setState(policies.state === "CONFIRMED" && claims.state === "CONFIRMED" ? "CONFIRMED" : String(policies.state || claims.state || "SYNCHRONIZATION_ERROR"));
      setEvents([
        ...(policies.items || []).map((item: any) => ({ time: String(item.created_at), title: "Base policy indexed", detail: String(item.policy_id), status: "Policy" })),
        ...(claims.items || []).map((item: any) => ({ time: String(item.created_at), title: "Claim state indexed", detail: String(item.id), status: String(item.status) })),
      ].sort((a, b) => b.time.localeCompare(a.time)));
    }).catch(() => {
      setEvents([]);
      setState("SYNCHRONIZATION_ERROR");
    });
  }, [wallet.authenticated]);

  return <>
    <PageHeading eyebrow="Protocol / traceable events" title="The audit trail." subtitle="This timeline is derived from authenticated records reconciled against Base Sepolia. It never uses illustrative activity." />
    {!wallet.authenticated && <SyncNotice text="Connect and sign in to inspect account activity." />}
    {wallet.authenticated && state !== "CONFIRMED" && state !== "LOADING" && <SyncNotice text="The account timeline is awaiting synchronized records." />}
    <div className="info-grid" style={{ marginBottom: 18 }}>
      {[
        { icon: Layers3, title: "Base transaction", text: "The immutable source for policy issuance, USDC reserves and transfers." },
        { icon: Activity, title: "GenLayer decision", text: "Bradbury owns adjudication state and finality for evidence decisions." },
        { icon: CheckCircle2, title: "Settlement proof", text: "Threshold signatures bind a finalized decision to a bounded Base payout." },
      ].map(item => <div className="info-card" key={item.title}><item.icon size={22} /><strong>{item.title}</strong><p>{item.text}</p></div>)}
    </div>
    <Panel title="Recent account timeline" sub="Indexed application events">
      {!wallet.authenticated ? <EmptyState title="No account selected" text="Sign in to load events for the connected wallet." /> : events.length ? <div className="activity-list">{events.map((item, index) => <div className="activity-row" key={item.title + item.detail + index}><div className="activity-marker"><Clock3 size={15} /></div><div className="activity-main"><strong>{item.title}</strong><p>{item.detail} · {item.status}</p></div><span className="activity-time">{new Date(item.time).toLocaleString("en-GB")}</span></div>)}</div> : <EmptyState title="No indexed events" text={state === "CONFIRMED" ? "No Base policy or claim records exist for this wallet." : "The timeline will appear once the indexer and database are available."} />}
    </Panel>
  </>;
}
