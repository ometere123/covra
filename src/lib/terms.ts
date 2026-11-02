import { keccak256, stringToHex } from "viem";
import { coverageById } from "./catalog";

export function canonicalTermsHash(coverageClass: number) {
  const risk = coverageById(coverageClass);
  const bindingTerms = {
    protocol: "COVRA",
    coverageClass,
    riskId: risk.slug,
    exclusions: risk.exclusions,
    objectiveRule: risk.objectiveRule,
    evidenceFacts: risk.evidenceFacts,
    payoutRule: risk.payoutRule,
    evidenceFormat: "covra-evidence",
    appealWindowSeconds: 259200,
    settlementGraceSeconds: 3888000,
    testnetOnly: true,
    financialStatus: "NON-BINDING_TESTNET_PROTOCOL_CONFIG",
    payoutSource: "RING_FENCED_USDC_POOL",
    attestationModel: "THREE_OF_FIVE_INDEPENDENT_VERIFIERS",
  };
  return keccak256(stringToHex(JSON.stringify(bindingTerms)));
}
