"use client";

import { Network } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProtocolStatus } from "@/lib/protocol-status";

function mainLabel(status: ProtocolStatus | null) {
  if (!status) return "Verifying";
  if (status.pool.state === "UNAVAILABLE" || status.adjudicator.state === "UNAVAILABLE") return "Unavailable";
  return "Deployed";
}

function poolLabel(status: ProtocolStatus | null) {
  if (!status) return "Verifying Base Sepolia pool";
  if (status.pool.state === "UNAVAILABLE") return "Base verification unavailable";
  return status.pool.state === "DEPLOYED_UNFUNDED" ? "Deployed · unfunded" : "Deployed · capital detected";
}

function adjudicatorLabel(status: ProtocolStatus | null) {
  if (!status) return "Verifying Bradbury adjudicator";
  if (status.adjudicator.state === "UNAVAILABLE") return "Bradbury verification unavailable";
  const cases = status.adjudicator.finalizedCaseCount;
  return cases === null ? "Deployed" : `Deployed · ${cases} finalized cases`;
}

export function ProtocolStateVisual() {
  const [status, setStatus] = useState<ProtocolStatus | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/api/protocol-status", { cache: "no-store" })
      .then(response => response.ok ? response.json() as Promise<ProtocolStatus> : Promise.reject(new Error("status unavailable")))
      .then(value => { if (active) setStatus(value); })
      .catch(() => { if (active) setStatus({
        checkedAt: new Date().toISOString(),
        pool: { state: "UNAVAILABLE", address: null, assetsMicroUsdc: null, reservedMicroUsdc: null, message: "Protocol status unavailable." },
        adjudicator: { state: "UNAVAILABLE", address: null, finalizedCaseCount: null, message: "Protocol status unavailable." },
        settlement: { state: "UNAVAILABLE", message: "Settlement readiness is unavailable." },
      }); });
    return () => { active = false; };
  }, []);

  const deployed = status?.pool.state === "DEPLOYED" || status?.pool.state === "DEPLOYED_UNFUNDED";
  const adjudicatorDeployed = status?.adjudicator.state === "DEPLOYED";
  const unavailable = status && (!deployed || !adjudicatorDeployed);
  const poolLive = status?.pool.state === "DEPLOYED";
  const barClass = status && poolLive ? "visual-bar-live" : "";
  return <>
    <div className="visual-topline"><span>COVRA / PROTOCOL STATE</span><span className="visual-top-dot"/> <span>{status ? "VERIFIED READ" : "CHECKING NETWORK"}</span></div>
    <div className="visual-core">
      <div className="visual-circle-outer"><div className="visual-orbit-dot"/><div className="visual-circle-inner" aria-live="polite"><span>DEPLOYMENT STATE</span><strong>{mainLabel(status)}</strong><Network size={33} strokeWidth={1.2}/></div></div>
      <div className="visual-meta visual-meta-left"><span className="visual-label">DEFINED CLASSES</span><strong>05</strong><span>PROTOCOL CONFIG</span></div>
      <div className="visual-meta visual-meta-right"><span className="visual-label">SETTLEMENT ASSET</span><strong>USDC</strong><span>BASE SEPOLIA</span></div>
    </div>
    <div className="visual-cards">
      <div><span>01 / BASE</span><strong>{poolLabel(status)}</strong><div className="visual-bar"><i className={barClass}/></div></div>
      <div><span>02 / BRADBURY</span><strong>{adjudicatorLabel(status)}</strong><div className="visual-bar visual-bar-ultra"><i className={adjudicatorDeployed ? "visual-bar-live" : ""}/></div></div>
    </div>
    <div className="visual-footer"><span>{unavailable ? "VERIFICATION REQUIRED" : status?.settlement.state === "NOT_READY" ? "DEPLOYED / NO CAPITAL" : "CLAIM-SPECIFIC FINALITY REQUIRED"}</span><span>BASE 84532 · BRADBURY 4221</span></div>
  </>;
}
