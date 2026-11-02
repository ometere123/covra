export type RiskId = 0 | 1 | 2 | 3 | 4;

export type Coverage = {
  id: RiskId;
  slug: string;
  name: string;
  short: string;
  description: string;
  signal: string;
  icon: string;
  tone: "stone" | "ultramarine" | "oxide";
  exclusions: string[];
  examples: string[];
  evidence: string[];
  objectiveRule: string;
  evidenceFacts: string[];
    payoutRule: string;
  testRateBps: number;
  maxDurationDays: number;
};

export const coverages: Coverage[] = [
  {
    id: 0, slug: "service", name: "Service failure", short: "Protect delivery commitments",
    description: "Defined compensation when an autonomous agent fails a contracted task or misses an objectively agreed deadline.",
    signal: "SERVICE / SLA", icon: "bot", tone: "stone", testRateBps: 250, maxDurationDays: 90,
    exclusions: ["Tasks without a signed service agreement", "Failures caused by excluded owner intervention"],
    examples: ["Research agent misses a contractual delivery window", "Agent job ends without the required artifact"],
    evidence: ["Signed task specification", "Immutable task receipt", "Deadline and execution attestations"],
    objectiveRule: "missed_deadline=true with task specification digest and independently substantiated contractual penalty",
    evidenceFacts: ["missed_deadline", "task_spec_hash", "contracted_penalty_micro_usdc"],
    payoutRule: "min(policy limit, independently verified contracted penalty)",
  },
  {
    id: 1, slug: "dependency", name: "Dependency outage", short: "Cover critical upstream failures",
    description: "Parametric cover for verified downtime of an eligible third-party API or infrastructure dependency.",
    signal: "DEPENDENCY / UPTIME", icon: "activity", tone: "ultramarine", testRateBps: 180, maxDurationDays: 180,
    exclusions: ["Self-induced downtime", "Unlisted providers or unverifiable private systems"],
    examples: ["Covered inference provider exceeds outage threshold", "Agent orchestration API is unavailable"],
    evidence: ["Approved provider registry", "Independent availability probes", "Status-feed corroboration"],
    objectiveRule: "outage_minutes >= 30 and independent_probes >= 2 for a named listed provider",
    evidenceFacts: ["provider_id", "outage_minutes", "independent_probes"],
    payoutRule: "30–59 minutes = 25% limit; 60–119 minutes = 50%; 120+ minutes = 100%",
  },
  {
    id: 2, slug: "execution", name: "Execution error", short: "Guard delegated actions",
    description: "Bounded coverage for a provable agent action outside its signed authorization and covered mandate.",
    signal: "EXECUTION / AUTH", icon: "shield", tone: "oxide", testRateBps: 420, maxDurationDays: 90,
    exclusions: ["Authorized losses", "Unverifiable intent", "Agent owner collusion"],
    examples: ["Agent spends beyond a documented execution limit", "Unauthorized parameter changes cause a defined loss"],
    evidence: ["Signed owner mandate", "Tool-call trace", "Transaction and resulting-state proof"],
    objectiveRule: "unauthorized_action=true with signed mandate, action transaction, and independently substantiated loss",
    evidenceFacts: ["unauthorized_action", "mandate_hash", "transaction_hash", "verified_loss_micro_usdc"],
    payoutRule: "min(policy limit, independently verified on-chain loss)",
  },
  {
    id: 3, slug: "defi", name: "DeFi protection", short: "Underwrite on-chain exposure",
    description: "Event-specific protections for named protocol incidents affecting an authorized DeFi agent.",
    signal: "DEFI / ON-CHAIN", icon: "blocks", tone: "ultramarine", testRateBps: 600, maxDurationDays: 45,
    exclusions: ["Market losses and leverage liquidations", "Protocols absent from the covered registry"],
    examples: ["Confirmed covered bridge compromise", "Specified depeg threshold sustained for the contract period"],
    evidence: ["Chain receipts and event logs", "Independent oracle observations", "Verified incident classification"],
    objectiveRule: "EXPLOIT, BRIDGE_COMPROMISE or DEPEG with incident transaction, >=2 observers and verified loss",
    evidenceFacts: ["incident_kind", "incident_tx_hash", "independent_observers", "verified_loss_micro_usdc"],
    payoutRule: "min(policy limit, independently verified covered DeFi loss)",
  },
  {
    id: 4, slug: "interruption", name: "Business interruption", short: "Preserve autonomous operations",
    description: "Capped, evidence-based compensation for a contractually defined interruption to an agent-dependent business process.",
    signal: "OPERATIONS / REVENUE", icon: "chart", tone: "oxide", testRateBps: 360, maxDurationDays: 120,
    exclusions: ["Speculative or undocumented revenue", "Unrelated demand changes", "Duplicate coverage claims"],
    examples: ["Agent commerce pipeline becomes unusable after a covered incident", "Automated billing operation halts"],
    evidence: ["Verified baseline metrics", "Independent outage chronology", "Attributable business-loss records"],
    objectiveRule: "interruption_minutes >= 120 and attributable_loss_micro_usdc > 0 with baseline hash",
    evidenceFacts: ["baseline_hash", "interruption_minutes", "attributable_loss_micro_usdc"],
    payoutRule: "min(policy limit, attributable interruption loss supported by baseline)",
  },
];

export const coverageById = (id: number): Coverage => {
  const found = coverages.find((item) => item.id === id);
  if (!found) throw new Error("Unsupported coverage class");
  return found;
};

export const formatUsdc = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount);

