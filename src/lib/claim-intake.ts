import type { z } from "zod";
import type { claimInputSchema } from "./quote";

type ClaimInput = z.infer<typeof claimInputSchema>;
type ExistingClaim = {
  policy_id: string;
  coverage_class: number;
  incident_at: string | Date;
  description: string;
  evidence_urls: unknown;
  requested_micro_usdc: string | number;
  evidence_manifest_hash: string | null;
  status: string;
};

/** An idempotency key must never silently stand for a different incident. */
export function sameClaimIntake(existing: ExistingClaim, input: ClaimInput): boolean {
  return existing.status !== "CANCELLED" &&
    existing.policy_id.toLowerCase() === input.policyId.toLowerCase() &&
    Number(existing.coverage_class) === input.coverageClass &&
    new Date(existing.incident_at).getTime() === new Date(input.incidentAt).getTime() &&
    existing.description === input.description &&
    JSON.stringify(existing.evidence_urls) === JSON.stringify(input.evidenceUrls) &&
    String(existing.requested_micro_usdc) === input.requestedMicroUsdc &&
    String(existing.evidence_manifest_hash).toLowerCase() === input.evidenceCommitment.toLowerCase();
}

export function canCancelUnanchoredClaim(status: string, baseLockTx: string | null,
  bradburyTx: string | null): boolean {
  return (status === "INTAKE" || status === "AWAITING_EVIDENCE") &&
    !baseLockTx && !bradburyTx;
}
