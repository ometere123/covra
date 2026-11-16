import { keccak256, stringToHex } from "viem";
import { canonicalJson } from "./claim-protocol";

const classes = [
  {
    subject: "Named delivery obligation and signed acceptance criteria",
    trigger: "Missed agreed deadline with enforceable penalty and independently corroborated delivery record",
    evidence: ["signed obligation", "deadline", "delivery and acceptance record", "penalty proof"],
    excluded: ["unsigned obligation", "owner interference", "claimant-only certification"],
    fault: "Failure attributable to the obligated party under the frozen agreement",
    minimumDurationSeconds: 0,
    payout: "verified contracted penalty capped at policy limit",
  },
  {
    subject: "Registry-approved provider and service",
    trigger: "At least 30 minutes of continuous service unavailability",
    evidence: ["provider incident chronology", "independently operated probe logs at intervals of at most 60 seconds"],
    excluded: ["planned maintenance", "self-induced downtime", "client-side misconfiguration"],
    fault: "Service failure attributable to the named upstream dependency",
    minimumDurationSeconds: 1800,
    payout: "25%, 50% or 100% of limit at 30, 60 or 120 minutes, rounded down",
  },
  {
    subject: "Named agent and signed action mandate",
    trigger: "Executed action exceeds the signed mandate and causes measurable loss",
    evidence: ["signed mandate", "independently reproducible action trace", "transaction and loss proof"],
    excluded: ["recommendations without execution", "owner-approved actions", "infrastructure faults", "collusion"],
    fault: "Loss directly attributable to unauthorized agent execution",
    minimumDurationSeconds: 0,
    payout: "verified direct loss capped at policy limit",
  },
  {
    subject: "Named eligible protocol and frozen exposure snapshot",
    trigger: "Exploit, bridge compromise or asset at least 500 basis points below its reference peg continuously for one hour",
    evidence: ["exposure snapshot", "chain receipts", "independent price observations for depeg", "realized loss proof"],
    excluded: ["ordinary market movement", "leverage liquidation", "speculative loss"],
    fault: "Loss directly attributable to the eligible protocol incident",
    minimumDurationSeconds: 0,
    payout: "verified realized covered loss capped at policy limit",
  },
  {
    subject: "Named operation and dependency with frozen baseline",
    trigger: "At least two hours of continuous interruption with measurable attributable loss",
    evidence: ["accepted baseline", "independent outage chronology", "loss reconciliation net of other compensation"],
    excluded: ["speculative revenue", "unrelated demand changes", "duplicate recovery"],
    fault: "Business loss directly attributable to the covered dependency interruption",
    minimumDurationSeconds: 7200,
    payout: "verified net attributable loss capped at policy limit",
  },
] as const;

export function v3Terms(coverageClass: number) {
  if (!Number.isInteger(coverageClass) || coverageClass < 0 || coverageClass >= classes.length)
    throw new Error("Unsupported V3 coverage class");
  return {
    ...classes[coverageClass],
    version: "covra-terms-v3",
    coverageClass,
    testnetOnly: true,
    inceptionDelaySeconds: 900,
    claimReportingSeconds: 14 * 86400,
    cureSeconds: 7 * 86400,
    appealSeconds: 72 * 3600,
    maxCures: 1,
    maxAppeals: 1,
    depegMinimumBps: coverageClass === 3 ? 500 : 0,
    depegMinimumSeconds: coverageClass === 3 ? 3600 : 0,
    exposure: "Aggregate maximum liability under the frozen provider and common-cause group",
    independence: "Approved, separately controlled and conflict-checked witnesses frozen at purchase",
    closure: "Quorum-attested finalized covered, denied or unproven disposition, subject to bounded expiry fallback",
  } as const;
}

export function v3TermsHash(coverageClass: number) {
  return keccak256(stringToHex(canonicalJson(v3Terms(coverageClass))));
}

export function v3Payout(coverageClass: number, policyLimit: bigint, verifiedLoss: bigint, observedSeconds: number) {
  const terms = v3Terms(coverageClass);
  if (policyLimit < 0n || verifiedLoss < 0n || !Number.isSafeInteger(observedSeconds) || observedSeconds < 0)
    throw new Error("Invalid V3 payout inputs");
  if (observedSeconds < terms.minimumDurationSeconds) return 0n;
  if (coverageClass === 1) {
    const percent = observedSeconds >= 7200 ? 100n : observedSeconds >= 3600 ? 50n : 25n;
    return policyLimit * percent / 100n;
  }
  return verifiedLoss < policyLimit ? verifiedLoss : policyLimit;
}
