/**
 * Every policy insures one narrowly identified exposure. Class terms alone
 * are insufficient: the exact subject, reference and issuer are signed.
 * These hashes do not certify that the referenced document is authentic.
 */
import { sha256, stringToHex } from "viem";
import { z } from "zod";

export const digest32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const issuerHost = z.string().trim().toLowerCase().regex(
  /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/,
);

export const riskSpecSchema = z.object({
  coverageClass: z.number().int().min(0).max(4),
  subject: z.string().trim().min(3).max(160),
  referenceHash: digest32,
  statement: z.string().trim().min(24).max(550),
  evidenceIssuerHost: issuerHost,
}).strict();
export type RiskSpec = z.infer<typeof riskSpecSchema>;

export const subjectLabels = [
  "SIGNED TASK OR DELIVERY IDENTIFIER",
  "NAMED API OR DEPENDENCY PROVIDER",
  "AUTHORIZED AGENT IDENTIFIER",
  "NAMED PROTOCOL OR BRIDGE",
  "NAMED BUSINESS OPERATION",
] as const;
export const referenceLabels = [
  "SHA-256 OF SIGNED TASK SPECIFICATION",
  "SHA-256 OF AGREED MONITORING METHOD",
  "SHA-256 OF SIGNED AGENT MANDATE",
  "SHA-256 OF COVERED EXPOSURE SNAPSHOT",
  "SHA-256 OF APPROVED BASELINE",
] as const;

export function canonicalRiskSpec(value: RiskSpec) {
  const v = riskSpecSchema.parse(value);
  // Cross-language parity with the GenLayer contract's canonical_json.
  return JSON.stringify({
    coverageClass: v.coverageClass,
    evidenceIssuerHost: v.evidenceIssuerHost,
    referenceHash: v.referenceHash.toLowerCase(),
    statement: v.statement,
    subject: v.subject,
  });
}

export function riskSpecDigest(value: RiskSpec): `0x${string}` {
  return sha256(stringToHex(canonicalRiskSpec(value)));
}

export function matchesRiskSpec(
  risk: number, facts: Record<string, unknown>, spec: RiskSpec,
): boolean {
  if (spec.coverageClass !== risk) return false;
  const reference = spec.referenceHash.toLowerCase();
  const sameReference = (field: string) => typeof facts[field] === "string" &&
    (facts[field] as string).toLowerCase() === reference;
  switch (risk) {
    case 0: return sameReference("task_spec_hash") && facts.task_id === spec.subject;
    case 1: return sameReference("monitoring_method_hash") && facts.provider_id === spec.subject;
    case 2: return sameReference("mandate_hash") && facts.agent_id === spec.subject;
    case 3: return sameReference("exposure_hash") && facts.protocol_id === spec.subject;
    case 4: return sameReference("baseline_hash") && facts.operation_id === spec.subject;
    default: return false;
  }
}
