import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { http, createPublicClient } from "viem";
import { testnetBradbury } from "genlayer-js/chains";
import {
  BRADBURY_FEE_DEPOSIT,
  makeDeploymentEnvelope,
} from "./bradbury-deployment-envelope.mjs";

const sourcePath = process.argv[2] || "contracts/genlayer/CovraAdjudicator.py";
const sender = process.env.BRADBURY_DEPLOYER_ADDRESS || "0x0d5540e0ad4b92aa0ad4e5f1b8cd645ee1e363e7";
const rpcUrl = process.env.BRADBURY_CHAIN_RPC_URL || "https://rpc.testnet-chain.genlayer.com";
const sourceBytes = readFileSync(sourcePath);
const source = sourceBytes.toString("utf8");
const envelope = makeDeploymentEnvelope({ source, sender });
const { outerCalldata: data, serializedDeployment: serialized } = envelope;
const client = createPublicClient({ transport: http(rpcUrl) });
let estimate = null;
let estimateError = null;
const simulationGasUpperBound = BigInt(process.env.BRADBURY_GAS_SIMULATION_UPPER || "60000000");
const simulationGasLowerBound = 21000n;
let simulationGasFloor = null;
let simulationError = null;
try {
  estimate = await client.estimateGas({
    account: sender,
    to: testnetBradbury.consensusMainContract.address,
    data,
    value: BRADBURY_FEE_DEPOSIT,
  });
} catch (error) {
  const value = error && typeof error === "object" ? error : {};
  estimateError = typeof value.shortMessage === "string"
    ? value.shortMessage
    : typeof value.details === "string"
      ? value.details
      : error instanceof Error ? error.message : String(error);
}
if (estimate === null) {
  const simulationCall = { account: sender, to: testnetBradbury.consensusMainContract.address, data, value: BRADBURY_FEE_DEPOSIT };
  const succeeds = async (gas) => {
    try {
      await client.call({ ...simulationCall, gas });
      return true;
    } catch {
      return false;
    }
  };
  if (await succeeds(simulationGasUpperBound)) {
    let low = simulationGasLowerBound;
    let high = simulationGasUpperBound;
    while (high - low > 1024n) {
      const middle = (low + high) / 2n;
      if (await succeeds(middle)) high = middle;
      else low = middle;
    }
    simulationGasFloor = high;
  } else {
    simulationError = `eth_call did not succeed at the ${simulationGasUpperBound} gas probe`;
  }
}
const sha = createHash("sha256").update(sourceBytes).digest("hex");
const cap = 1n << 24n;
const effectiveGas = estimate ?? simulationGasFloor;
console.log(JSON.stringify({
  sourcePath,
  sourceBytes: sourceBytes.byteLength,
  sourceSha256: sha,
  serializedDeploymentHexChars: envelope.serializedDeploymentHexChars,
  serializedDeploymentBytes: envelope.serializedDeploymentBytes,
  outerCalldataBytes: envelope.outerCalldataBytes,
  estimateGas: estimate?.toString() || null,
  estimateError,
  simulationGasUpperBound: simulationGasUpperBound.toString(),
  simulationGasFloor: simulationGasFloor?.toString() || null,
  simulationError,
  BradburyMaxTransactionGas: cap.toString(),
  withinBradburyGasCap: effectiveGas !== null && effectiveGas < cap,
  sender,
  rpcUrl,
}, null, 2));
if (estimate === null || estimate >= cap) process.exitCode = 1;
