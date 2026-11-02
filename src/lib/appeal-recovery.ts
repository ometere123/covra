export type AppealRecoveryStep =
  | "APPEAL_BRADBURY_AND_REVISE_BASE"
  | "SUBMIT_BRADBURY_ONLY"
  | "REVISE_BASE_ONLY"
  | "ALREADY_SYNCHRONIZED";

type AppealChainState = {
  baseRevision: number;
  baseDigest: string;
  bradburyRevision: number;
  bradburyDigest: string;
  bradburyState: string;
  desiredDigest: string;
};

/** Reconcile the two irreversible writes without repeating a completed leg. */
export function planAppealRecovery(state: AppealChainState): AppealRecoveryStep {
  const {baseRevision,bradburyRevision,bradburyState}=state;
  if (![0,1].includes(baseRevision)||![0,1].includes(bradburyRevision))
    throw new Error("Unsupported on-chain appeal revision");
  if (baseRevision===1 && state.baseDigest.toLowerCase()!==state.desiredDigest.toLowerCase())
    throw new Error("Base has already consumed its appeal for different evidence");
  if (bradburyRevision===1 && state.bradburyDigest.toLowerCase()!==state.desiredDigest.toLowerCase())
    throw new Error("Bradbury has already consumed its appeal for different evidence");
  if (bradburyRevision===0 && bradburyState!=="DECIDED")
    throw new Error("Bradbury is not in its initial appealable decided state");
  if (bradburyRevision===1 && !["SUBMITTED","DECIDED","FINALIZED"].includes(bradburyState))
    throw new Error("Bradbury appeal is in an unexpected state");
  if (baseRevision===1 && bradburyRevision===1) return "ALREADY_SYNCHRONIZED";
  if (baseRevision===1) return "SUBMIT_BRADBURY_ONLY";
  if (bradburyRevision===1) return "REVISE_BASE_ONLY";
  // Bradbury has the shorter, three-day window. Record its appeal first;
  // a delayed Base evidence revision can then be retried independently.
  return "APPEAL_BRADBURY_AND_REVISE_BASE";
}
