export const BRADBURY_APPEAL_WINDOW_SECONDS = 72 * 60 * 60;

export type BradburyDecisionCase = {
  state?: unknown;
  decided_at?: unknown;
  appeal_used?: unknown;
};

export type FinalizationReadiness = {
  ready: boolean;
  reason: string;
  decidedAt: number | null;
  earliestFinalizationAt: number | null;
};

/**
 * A transaction receipt can be finalized while the adjudication case is still
 * appealable. This gate is deliberately pure so browser and operator tooling
 * can apply the same check immediately before a finalize_case write.
 */
export function finalizationReadiness(
  record: BradburyDecisionCase,
  nowSeconds: number,
): FinalizationReadiness {
  const decidedAt = typeof record.decided_at === "number"
    ? record.decided_at
    : typeof record.decided_at === "string" && /^\d+$/.test(record.decided_at)
      ? Number(record.decided_at)
      : NaN;

  if (!Number.isSafeInteger(decidedAt) || decidedAt <= 0) {
    return {
      ready: false,
      reason: "Bradbury returned no safe decision timestamp; do not submit finalize_case.",
      decidedAt: null,
      earliestFinalizationAt: null,
    };
  }

  const earliestFinalizationAt = decidedAt + BRADBURY_APPEAL_WINDOW_SECONDS;
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) {
    return {
      ready: false,
      reason: "The finalization clock is invalid; do not submit finalize_case.",
      decidedAt,
      earliestFinalizationAt,
    };
  }

  const state = String(record.state ?? "").toUpperCase();
  if (state === "FINALIZED") {
    return {
      ready: false,
      reason: "The Bradbury case is already finalized; recover its existing receipt instead of submitting again.",
      decidedAt,
      earliestFinalizationAt,
    };
  }
  if (state !== "DECIDED") {
    return {
      ready: false,
      reason: `The Bradbury case is ${state || "unknown"}, not DECIDED; do not submit finalize_case.`,
      decidedAt,
      earliestFinalizationAt,
    };
  }
  if (nowSeconds < earliestFinalizationAt) {
    return {
      ready: false,
      reason: `The Bradbury appeal window remains open until ${new Date(earliestFinalizationAt * 1000).toISOString()}; do not submit finalize_case before then.`,
      decidedAt,
      earliestFinalizationAt,
    };
  }

  return {
    ready: true,
    reason: "The case is DECIDED and the full Bradbury appeal window has elapsed; re-read the case immediately before writing.",
    decidedAt,
    earliestFinalizationAt,
  };
}
