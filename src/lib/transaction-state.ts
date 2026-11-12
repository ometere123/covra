export type TransactionPhase =
  | "IDLE"
  | "AWAITING_SIGNATURE"
  | "SUBMITTED"
  | "CONFIRMING"
  | "CONFIRMED"
  | "REVERTED"
  | "RECOVERABLE_ERROR";

export const transactionPhaseLabel: Record<TransactionPhase, string> = {
  IDLE: "Not started",
  AWAITING_SIGNATURE: "Awaiting wallet signature",
  SUBMITTED: "Submitted",
  CONFIRMING: "Pending confirmation",
  CONFIRMED: "Confirmed",
  REVERTED: "Reverted",
  RECOVERABLE_ERROR: "Recoverable error",
};

export function transactionPhaseTone(phase: TransactionPhase): "neutral" | "pending" | "success" | "error" {
  if (phase === "CONFIRMED") return "success";
  if (phase === "REVERTED" || phase === "RECOVERABLE_ERROR") return "error";
  if (phase === "AWAITING_SIGNATURE" || phase === "SUBMITTED" || phase === "CONFIRMING") return "pending";
  return "neutral";
}
