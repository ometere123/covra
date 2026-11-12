/**
 * COVRA settlement protocol. Invariants are shared with CovraPools.sol and
 * CovraAdjudicator.py. All actual cross-chain decisions require independent
 * finality verification; this file NEVER signs on behalf of attestors.
 */
import { sha256, stringToHex, toHex } from "viem";
import { z } from "zod";
import { riskSpecSchema } from "./risk-spec";

export const BRADBURY_SOURCE_CHAIN = 4221;
export const BASE_SETTLEMENT_CHAIN = 84532;
export const APPEAL_WINDOW_SECONDS = 3 * 86400;
export const SETTLEMENT_GRACE_SECONDS = 45 * 86400;
export const EVIDENCE_SCHEMA = "covra-evidence";
export const evidenceProvenanceClass = z.enum([
  "THIRD_PARTY_PUBLIC", "COVRA_CONTROLLED", "CLAIMANT_CONTROLLED", "UNKNOWN",
]);
export const hex32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const canonicalTimestamp = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/,
  "Timestamp must be a canonical UTC ISO-8601 timestamp",
);

// Stable serialization on both Python and JS: lexicographic keys at each level.
export function canonicalJson(input: unknown): string {
  if (Array.isArray(input)) return "[" + input.map(canonicalJson).join(",") + "]";
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    return "{" + Object.keys(record).sort()
      .map((key) => JSON.stringify(key) + ":" + canonicalJson(record[key])).join(",") + "}";
  }
  return JSON.stringify(input);
}
export const sha256Digest = (input: string | Uint8Array) =>
  sha256(typeof input === "string" ? stringToHex(input) : toHex(input));
export function claimIdFromUuid(uuid: string, insured: string): `0x${string}` {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid) ||
      !/^0x[0-9a-fA-F]{40}$/.test(insured)) throw new Error("Invalid insured wallet or claim nonce");
  return sha256Digest("COVRA-CLAIM:" + insured.toLowerCase() + ":" + uuid.toLowerCase());
}

export const evidenceEnvelope = z.object({
  schema: z.literal(EVIDENCE_SCHEMA),
  policy_id: hex32,
  claim_id: hex32,
  terms_hash: hex32,
  risk_spec_hash: hex32,
  risk_spec: riskSpecSchema,
  coverage_class: z.number().int().min(0).max(4),
  observation_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/),
  event_time: canonicalTimestamp,
  observed_at: canonicalTimestamp,
  observation_mode: z.literal("OBSERVED_PUBLIC"),
  source_details: z.object({
    issuer_host: z.string().min(1).max(253),
    endpoint: z.string().url(),
    retrieval_method: z.literal("https_get"),
    source_payload_digest: hex32,
    // Observed records bind the public source fetched by the issuer and its
    // raw response digest.
    origin_url: z.string().url().optional(),
    origin_payload_digest: hex32.optional(),
    // These fields are optional for historical V1 envelopes, but required by
    // the V2 adjudicator. A label is provenance metadata, not proof that the
    // issuer or source is actually independent.
    provenance_class: evidenceProvenanceClass.optional(),
    independent_observer_count: z.number().int().min(0).max(16).optional(),
    source_authority: z.string().min(2).max(240).optional(),
  }).strict(),
  issuer: z.object({
    wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    signed_at: z.number().int().positive(),
    expires_at: z.number().int().positive(),
    signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  }).strict(),
  facts: z.record(z.string(), z.unknown()),
}).strict();

export function validateCoverageFacts(risk: number, facts: Record<string, unknown>): boolean {
  const hex = (value: unknown) => typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
  const exactInt = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value);
  switch (risk) {
    case 0: return facts.missed_deadline === true && hex(facts.task_spec_hash) &&
      exactInt(facts.contracted_penalty_micro_usdc) && (facts.contracted_penalty_micro_usdc as number) > 0;
    case 1: return typeof facts.provider_id === "string" && facts.provider_id.length > 2 &&
      exactInt(facts.outage_minutes) && (facts.outage_minutes as number) >= 30 &&
      exactInt(facts.independent_probes) && (facts.independent_probes as number) >= 2;
    case 2: return facts.unauthorized_action === true && hex(facts.mandate_hash) && hex(facts.transaction_hash) &&
      exactInt(facts.verified_loss_micro_usdc) && (facts.verified_loss_micro_usdc as number) > 0;
    case 3: return ["EXPLOIT", "BRIDGE_COMPROMISE", "DEPEG"].includes(String(facts.incident_kind)) &&
      hex(facts.incident_tx_hash) && exactInt(facts.independent_observers) &&
      (facts.independent_observers as number) >= 2 &&
      exactInt(facts.verified_loss_micro_usdc) && (facts.verified_loss_micro_usdc as number) > 0;
    case 4: return hex(facts.baseline_hash) && exactInt(facts.interruption_minutes) &&
      (facts.interruption_minutes as number) >= 120 &&
      exactInt(facts.attributable_loss_micro_usdc) &&
      (facts.attributable_loss_micro_usdc as number) > 0;
    default: return false;
  }
}

/**
 * Settlement amount MUST follow immutable class terms, NOT a model-proposed
 * number and NOT claimant-specified severity. Attestors check authenticity of
 * independent source facts before applying this deterministic cap.
 */
export function computeCoveragePayout(
  risk: number, coverageLimitMicro: bigint, facts: Record<string, unknown>,
): bigint {
  if (!validateCoverageFacts(risk, facts)) throw new Error("Missing mandatory payout facts");
  if (coverageLimitMicro <= 0n) throw new Error("Invalid cover limit");
  const ceiling = (amount: bigint) => amount > coverageLimitMicro ? coverageLimitMicro : amount;
  if (risk === 1) {
    const minutes = facts.outage_minutes as number;
    return coverageLimitMicro * (minutes >= 120 ? 100n : minutes >= 60 ? 50n : 25n) / 100n;
  }
  const field = risk === 0 ? "contracted_penalty_micro_usdc" :
    risk === 4 ? "attributable_loss_micro_usdc" : "verified_loss_micro_usdc";
  return ceiling(BigInt(facts[field] as number));
}

export const resultDigestInput = z.object({
  case_id: z.string().min(8).max(80),
  policy_id: hex32,
  claim_id: hex32,
  terms_hash: hex32,
  risk_spec_hash: hex32,
  verdict: z.enum(["COVERED", "NOT_COVERED", "INSUFFICIENT_EVIDENCE"]),
  revision: z.number().int().min(0).max(1),
  evidence_hash: hex32,
  coverage_class: z.number().int().min(0).max(4),
  finalized_at: z.number().int().positive(),
}).strict();
export const finalizedResultDigest = (record: z.infer<typeof resultDigestInput>) =>
  sha256Digest(canonicalJson(resultDigestInput.parse(record)));

export const decisionTypes = {
  Decision: [
    { name: "policyId", type: "bytes32" },
    { name: "claimId", type: "bytes32" },
    { name: "bradburyDecisionId", type: "bytes32" },
    { name: "genlayerTxId", type: "bytes32" },
    { name: "evidenceDigest", type: "bytes32" },
    { name: "resultDigest", type: "bytes32" },
    { name: "termsHash", type: "bytes32" },
    { name: "riskSpecHash", type: "bytes32" },
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint96" },
    { name: "coverageClass", type: "uint8" },
    { name: "verdict", type: "uint8" },
    { name: "revision", type: "uint8" },
    { name: "finalizedAt", type: "uint64" },
    { name: "deadline", type: "uint64" },
    { name: "sourceChainId", type: "uint256" },
    { name: "adjudicator", type: "address" },
  ],
} as const;

export function verifiedVerdictCode(verdict: string): 1 | 2 {
  if (verdict === "COVERED") return 1;
  if (verdict === "NOT_COVERED") return 2;
  throw new Error("Insufficient evidence cannot authorize a final Base settlement");
}
