import baseDeployment from "../../docs/deployments/base-84532-0xfe01a9b68ac5a54df1173231c49838a0d67ba37be35e85624cd7d912461f93f2.json";
import lifecycle from "../../docs/deployments/class0-live-lifecycle.json";
import purchase from "../../docs/deployments/class0-base-funding-purchase-2026-11-11.json";
import { coverages } from "@/lib/catalog";
import { readProtocolStatus, type ProtocolStatus } from "@/lib/protocol-status";

const CLAIM_SETTLEMENT_GRACE_SECONDS = 45 * 24 * 60 * 60;
const claimDeadlineSeconds = Number(purchase.postflight.policy.claimDeadline);

export const publicPilot = {
  taskId: lifecycle.taskId,
  taskHash: lifecycle.taskHash,
  taskDeadline: lifecycle.deadlineIso,
  policyId: lifecycle.policyId,
  claimId: lifecycle.baseLock.claimId,
  claimUuid: lifecycle.claim.claim.id,
  evidenceDigest: lifecycle.evidence.evidenceDigest,
  evidenceUrl: lifecycle.evidence.publicUrl,
  evidenceOriginUrl: lifecycle.evidence.originUrl,
  evidenceIssuerWallet: lifecycle.evidence.issuerWallet,
  evidenceMode: lifecycle.evidence.observationMode,
  evidenceCommit: lifecycle.observationCommit,
  decision: lifecycle.bradburyCase.verdict,
  decisionReason: lifecycle.bradburyCase.reason,
  decisionCitations: lifecycle.bradburyCase.citations,
  bradburyFinalizationAt: lifecycle.earliestFinalizationAt,
  basePool: lifecycle.pool,
  adjudicator: lifecycle.adjudicator,
  baseChainId: lifecycle.chainId,
  bradburyChainId: 4221,
  usdc: purchase.usdc,
  coverageClass: purchase.coverageClass,
  coverageUsd: purchase.quote.coverageUsd,
  premiumUsd: purchase.quote.premiumUsd,
  poolDepositUsd: purchase.allocation.depositMicroUsdc,
  termsHash: purchase.quote.termsHash,
  riskSpecHash: purchase.quote.quote.riskSpecHash,
  policyStartsAt: new Date(Number(purchase.postflight.policy.startsAt) * 1000).toISOString(),
  policyEndsAt: new Date(Number(purchase.postflight.policy.endsAt) * 1000).toISOString(),
  claimDeadline: new Date(claimDeadlineSeconds * 1000).toISOString(),
  claimResolutionDeadline: new Date((claimDeadlineSeconds + CLAIM_SETTLEMENT_GRACE_SECONDS) * 1000).toISOString(),
  receipts: {
    baseFundingApproval: purchase.receipts.fundingApproval.hash,
    baseDeposit: purchase.receipts.deposit.hash,
    basePurchaseApproval: purchase.receipts.purchaseApproval.hash,
    basePurchase: purchase.receipts.purchase.hash,
    baseLock: lifecycle.baseLock.transactionHash,
    bradburySubmit: lifecycle.bradburySubmit.transactionHash,
    bradburyAdjudicate: lifecycle.bradburyAdjudicate.transactionHash,
  },
  deployment: {
    baseTransaction: baseDeployment.transactionHash,
    baseBlock: baseDeployment.blockNumber,
    baseSourceHash: baseDeployment.sourceSha256,
    bradburyTransaction: "0xd19bcbd6d2c6d3d2718312bb7114eec69d95facbf26a67cd00c2f7ee26432b28",
    bradburySourceHash: "4f424277b2aa1c23d599f8936452c7d16989ab7bd4e4265fbb28aab57092d0f2",
  },
} as const;

export const publicCoverageClasses = coverages.map(({ id, name, short, signal, objectiveRule, evidence, payoutRule }) => ({
  id,
  name,
  short,
  signal,
  objectiveRule,
  evidence,
  payoutRule,
}));

export async function readPublicDemoStatus(): Promise<ProtocolStatus | null> {
  try {
    return await readProtocolStatus();
  } catch {
    return null;
  }
}
