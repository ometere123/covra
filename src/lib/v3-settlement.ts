import { type Address } from "viem";

// Field order and widths mirror CovraPoolsV3.DECISION_TYPEHASH.
export const v3DecisionTypes = {
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
    { name: "decidedAt", type: "uint64" },
    { name: "cureDeadline", type: "uint64" },
    { name: "rosterVersion", type: "uint256" },
    { name: "verifiedLoss", type: "uint96" },
    { name: "observedSeconds", type: "uint32" },
  ],
} as const;

export function v3SettlementDomain(verifyingContract: Address) {
  return { name: "COVRA", version: "3", chainId: 84532, verifyingContract } as const;
}
