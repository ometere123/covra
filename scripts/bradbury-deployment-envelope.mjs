import { abi } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { encodeFunctionData } from "viem";

export const BRADBURY_CONSENSUS = testnetBradbury.consensusMainContract.address;
export const BRADBURY_FEE_DEPOSIT = 100000000000010352n;
export const BRADBURY_DEFAULT_DISTRIBUTION = Object.freeze({
  leaderTimeunitsAllocation: 100n,
  validatorTimeunitsAllocation: 200n,
  appealRounds: 0n,
  executionBudgetPerRound: 25_000_000_000_000_000n,
  executionConsumed: 0n,
  totalMessageFees: 0n,
  rotations: Object.freeze([3n]),
  maxPriceGenPerTimeUnit: 2n,
  storageFeeMaxGasPrice: 300_000_000n,
  receiptFeeMaxGasPrice: 300_000_000n,
});

const ADD_TRANSACTION_ABI = testnetBradbury.consensusMainContract.abi.find(
  (item) => item.type === "function" && item.name === "addTransaction",
);
if (!ADD_TRANSACTION_ABI) throw new Error("Bradbury consensus ABI has no addTransaction");

export function hexByteLength(value) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value) || (value.length - 2) % 2 !== 0) {
    throw new Error("Expected an even-length hexadecimal value");
  }
  return (value.length - 2) / 2;
}

export function makeDeploymentEnvelope({
  source,
  sender,
  feeValue = BRADBURY_FEE_DEPOSIT,
  distribution = BRADBURY_DEFAULT_DISTRIBUTION,
  validUntil = 0n,
  maxRotations = 3n,
  numOfInitialValidators = 5n,
  saltNonce = 0n,
  userValue = 0n,
  recipient = "0x0000000000000000000000000000000000000000",
}) {
  if (typeof source !== "string" || !source) throw new Error("Deployment source is required");
  if (!sender) throw new Error("Deployment sender is required");
  const constructorData = abi.calldata.encode(abi.calldata.makeCalldataObject(undefined, [], undefined));
  const serializedDeployment = abi.transactions.serialize([source, constructorData, false]);
  const outerCalldata = encodeFunctionData({
    abi: [ADD_TRANSACTION_ABI],
    functionName: "addTransaction",
    args: [{
      sender,
      recipient,
      numOfInitialValidators,
      maxRotations,
      validUntil,
      saltNonce,
      userValue,
      feesDistribution: distribution,
      txCalldata: serializedDeployment,
      messageAllocations: [],
    }],
  });
  return {
    constructorData,
    serializedDeployment,
    outerCalldata,
    feeValue,
    serializedDeploymentHexChars: serializedDeployment.length,
    serializedDeploymentBytes: hexByteLength(serializedDeployment),
    outerCalldataBytes: hexByteLength(outerCalldata),
  };
}
