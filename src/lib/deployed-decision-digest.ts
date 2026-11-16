import { createHash } from "node:crypto";
import { z } from "zod";

const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const reference = z.string().min(1).max(640);
const references = z.array(reference).max(8);
// Python sorts these fixed ASCII keys and emits UTF-8 without ASCII escaping.
const common = z.object({
  id: bytes32, policy_id: bytes32, claim_id: bytes32,
  terms_hash: bytes32, risk_spec_hash: bytes32, evidence_hash: bytes32,
  verdict: z.enum(["COVERED", "NOT_COVERED", "INSUFFICIENT_EVIDENCE"]),
  revision: z.number().int().min(0).max(1),
  risk: z.number().int().min(0).max(4),
  finalized_at: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  state: z.literal("FINALIZED"),
});
const structured = z.object({
  decision_schema: z.literal("covra-decision-v2"),
  confidence: z.number().int().min(0).max(100),
  findings: z.array(z.object({
    id: reference, status: reference, evidence_refs: references,
  }).strict()).max(32),
  evidence_refs: references,
  provenance: z.enum(["THIRD_PARTY_PUBLIC", "COVRA_CONTROLLED", "CLAIMANT_CONTROLLED", "UNKNOWN"]),
  exclusions: references,
  contradictions: references,
  uncertainty: references,
});
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const v3Common = common.extend({
  verdict: z.enum(["COVERED", "NOT_COVERED", "UNPROVEN_CLOSED"]),
  state: z.enum(["FINALIZED", "UNPROVEN_CLOSED"]),
  revision: z.number().int().min(0).max(2),
  event_time: z.iso.datetime(),
  cure_deadline: timestamp,
  resolution_deadline: timestamp,
  decided_at: timestamp,
});
const v3Structured = structured.extend({ decision_schema: z.literal("covra-decision-v3") });

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).sort().map(key =>
      JSON.stringify(key) + ":" + canonical(record[key])).join(",") + "}";
  }
  if (typeof value === "string" && /[\uD800-\uDFFF]/u.test(value))
    throw new Error("Decision contains an unpaired Unicode surrogate");
  return JSON.stringify(value);
}

export function deployedDecisionDigest(version: string, record: unknown) {
  if (version === "V3") {
    const { id, risk, ...fields } = v3Common.parse(record);
    if ((fields.state === "UNPROVEN_CLOSED") !== (fields.verdict === "UNPROVEN_CLOSED"))
      throw new Error("Inconsistent V3 terminal state and verdict");
    return "0x" + createHash("sha256").update(canonical({
      ...fields, ...v3Structured.parse(record), case_id: id, coverage_class: risk,
      protocol_version: "COVRA_ADJUDICATOR_V3",
    }), "utf8").digest("hex");
  }
  const { id, risk, ...fields } = common.parse(record);
  const payload: Record<string, unknown> = {
    ...fields, case_id: id, coverage_class: risk,
  };
  delete payload.state;
  if (version === "V2") {
    Object.assign(payload, structured.parse(record));
  } else if (version === "V1") {
    if (Object.keys(structured.shape).some(key => Object.hasOwn(record as object, key)))
      throw new Error("Structured decision fields are incompatible with V1");
  } else {
    throw new Error("Unsupported decision digest version");
  }
  return "0x" + createHash("sha256").update(canonical(payload), "utf8").digest("hex");
}
