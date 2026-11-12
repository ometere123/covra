import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { encodeFunctionData, http, createPublicClient } from "viem";
import { abi } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const sourcePath = process.argv[2] || "contracts/genlayer/CovraAdjudicator.py";
const sender = process.env.BRADBURY_DEPLOYER_ADDRESS || "0x0d5540e0ad4b92aa0ad4e5f1b8cd645ee1e363e7";
const rpcUrl = process.env.BRADBURY_CHAIN_RPC_URL || "https://rpc.testnet-chain.genlayer.com";
const sourceBytes = readFileSync(sourcePath);
const source = sourceBytes.toString("utf8");
const constructorData = abi.calldata.encode(abi.calldata.makeCalldataObject(undefined, [], undefined));
const serialized = abi.transactions.serialize([source, constructorData, false]);
const distribution = {
  leaderTimeunitsAllocation: 100n,
  validatorTimeunitsAllocation: 200n,
  appealRounds: 0n,
  executionBudgetPerRound: 25_000_000_000_000_000n,
  executionConsumed: 0n,
  totalMessageFees: 0n,
  rotations: [3n],
  maxPriceGenPerTimeUnit: 2n,
  storageFeeMaxGasPrice: 300_000_000n,
  receiptFeeMaxGasPrice: 300_000_000n,
};
const functionAbi = testnetBradbury.consensusMainContract.abi.find((item) => item.type === "function" && item.name === "addTransaction");
if (!functionAbi) throw new Error("Bradbury consensus ABI has no addTransaction");
const data = encodeFunctionData({
  abi: [functionAbi],
  functionName: "addTransaction",
  args: [{
    sender,
    recipient: "0x0000000000000000000000000000000000000000",
    numOfInitialValidators: 5n,
    maxRotations: 3n,
    validUntil: 0n,
    saltNonce: 0n,
    userValue: 0n,
    feesDistribution: distribution,
    txCalldata: serialized,
    messageAllocations: [],
  }],
});
const client = createPublicClient({ transport: http(rpcUrl) });
let estimate = null;
let estimateError = null;
try {
  estimate = await client.estimateGas({
    account: sender,
    to: testnetBradbury.consensusMainContract.address,
    data,
    value: 100000000000010352n,
  });
} catch (error) {
  const value = error && typeof error === "object" ? error : {};
  estimateError = typeof value.shortMessage === "string"
    ? value.shortMessage
    : typeof value.details === "string"
      ? value.details
      : error instanceof Error ? error.message : String(error);
}
const sha = createHash("sha256").update(sourceBytes).digest("hex");
const cap = 1n << 24n;
console.log(JSON.stringify({
  sourcePath,
  sourceBytes: sourceBytes.byteLength,
  sourceSha256: sha,
  serializedDeploymentBytes: serialized.length,
  outerCalldataBytes: (data.length - 2) / 2,
  estimateGas: estimate?.toString() || null,
  estimateError,
  BradburyMaxTransactionGas: cap.toString(),
  withinBradburyGasCap: estimate !== null && estimate < cap,
  sender,
  rpcUrl,
}, null, 2));
if (estimate === null || estimate >= cap) process.exitCode = 1;
