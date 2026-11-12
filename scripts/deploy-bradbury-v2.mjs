import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, encodeFunctionData, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { abi, createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { assertBradburyNodeIdentity } from "../src/lib/bradbury-final-state.ts";

// This script is deliberately a testnet-only, resumable deployment gate. It
// loads the private key through the normal protected environment mechanism but
// never prints, persists, or passes the key through a command-line argument.
if (process.env.COVRA_ENV !== "testnet" || process.env.COVRA_DEPLOY_CONFIRM !== "TESTNET_ONLY") {
  throw new Error("Refusing Bradbury deployment: testnet confirmation is absent");
}

const endpoint = process.env.BRADBURY_NODE_RPC_URL || "https://rpc-bradbury.genlayer.com";
const chainRpc = process.env.BRADBURY_CHAIN_RPC_URL || "https://rpc.testnet-chain.genlayer.com";
const sourcePath = process.argv[2] || "contracts/genlayer/CovraAdjudicator.py";
const privateKey = process.env.BRADBURY_DEPLOYER_PRIVATE_KEY;
if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("Bradbury deployment key is unavailable; use the isolated Praest key variable, never the Base deployer key");

const sourceBytes = readFileSync(join(process.cwd(), sourcePath));
const source = sourceBytes.toString("utf8");
const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
const runner = source.match(/py-genlayer:[a-z0-9]+/)?.[0] || null;
if (!runner) throw new Error("V2 source does not contain a pinned py-genlayer runner");

await assertBradburyNodeIdentity(endpoint);
const account = privateKeyToAccount(privateKey);
if (process.env.BRADBURY_DEPLOYER_ADDRESS && process.env.BRADBURY_DEPLOYER_ADDRESS.toLowerCase() !== account.address.toLowerCase()) {
  throw new Error("Bradbury deployer address does not match the supplied isolated key");
}
const client = createClient({ chain: testnetBradbury, endpoint, account });
if (await client.getChainId() !== 4221) throw new Error("Configured GenLayer node is not chain 4221");

const schema = await client.getContractSchemaForCode(source);
const methodNames = Object.keys(schema.methods || {}).sort();
if (methodNames.length !== 11 || !methodNames.includes("get_protocol_version") || !methodNames.includes("finalize_case")) {
  throw new Error("V2 schema gate failed: expected 11 public methods including protocol version and finalization");
}

const estimate = await client.estimateTransactionFees({});
if (estimate.feeValue <= 0n) throw new Error("Bradbury returned a zero deployment protocol-fee estimate");
// RC2's outer EVM gas estimator reverts for this large source payload and its
// fallback (200,000) is below the EVM calldata intrinsic cost. Derive the
// override from the exact serialized GenLayer deployment envelope rather than
// guessing a protocol fee or bypassing FeeManager.
const constructorData = abi.calldata.encode(abi.calldata.makeCalldataObject(undefined, [], undefined));
const serializedDeployment = abi.transactions.serialize([source, constructorData, false]);
let zeroBytes = 0n;
let nonZeroBytes = 0n;
for (const byte of serializedDeployment) {
  if (byte === 0) zeroBytes += 1n;
  else nonZeroBytes += 1n;
}
const intrinsicGas = 21000n + zeroBytes * 4n + nonZeroBytes * 16n;
const evm = createPublicClient({ transport: http(chainRpc) });
const balance = await evm.getBalance({ address: account.address });
if (balance <= estimate.feeValue) throw new Error("Bradbury deployer balance is not greater than the protocol-fee deposit");
const addTransaction = testnetBradbury.consensusMainContract.abi.find((item) => item.type === "function" && item.name === "addTransaction");
if (!addTransaction) throw new Error("Bradbury consensus ABI has no addTransaction method");
const distribution = { ...estimate.distribution, executionConsumed: estimate.distribution.executionConsumed ?? 0n };
const simulationData = encodeFunctionData({
  abi: [addTransaction],
  functionName: "addTransaction",
  args: [{
    sender: account.address,
    recipient: "0x0000000000000000000000000000000000000000",
    numOfInitialValidators: 5n,
    maxRotations: 3n,
    validUntil: 0n,
    saltNonce: 0n,
    userValue: 0n,
    feesDistribution: distribution,
    txCalldata: serializedDeployment,
    messageAllocations: [],
  }],
});
const maxBradburyTransactionGas = 1n << 24n;
let estimatedOuterGas = null;
let gasPreflightMethod = "eth_estimateGas";
let gasPreflightError = null;
try {
  estimatedOuterGas = await evm.estimateGas({ account: account.address, to: testnetBradbury.consensusMainContract.address, data: simulationData, value: estimate.feeValue });
} catch (error) {
  gasPreflightError = error instanceof Error ? error.message : String(error);
}
// The public Bradbury endpoint can reject eth_estimateGas for a large IC
// envelope even when a sufficiently provisioned read-only call succeeds. Use
// a bounded call-only binary search to measure the execution floor; this never
// signs or broadcasts a transaction. The measured floor still has to be below
// the verified runtime gate before deployment can proceed.
if (estimatedOuterGas === null) {
  gasPreflightMethod = "bounded-eth_call";
  const upper = BigInt(process.env.BRADBURY_GAS_SIMULATION_UPPER || "60000000");
  let succeeds = false;
  try {
    await evm.call({ account: account.address, to: testnetBradbury.consensusMainContract.address, data: simulationData, value: estimate.feeValue, gas: upper });
    succeeds = true;
  } catch {
    // Keep the detailed estimate error private to the local diagnostic; the
    // final message below contains no credentials or transaction payload.
  }
  if (!succeeds) {
    throw new Error(`Bradbury outer gas preflight failed: eth_estimateGas reverted (${gasPreflightError || "unknown error"}) and eth_call did not succeed at ${upper} gas; no deployment submitted`);
  }
  let low = 21000n;
  let high = upper;
  while (high - low > 1024n) {
    const middle = (low + high) / 2n;
    try {
      await evm.call({ account: account.address, to: testnetBradbury.consensusMainContract.address, data: simulationData, value: estimate.feeValue, gas: middle });
      high = middle;
    } catch {
      low = middle;
    }
  }
  estimatedOuterGas = high;
}
if (estimatedOuterGas >= maxBradburyTransactionGas) {
  throw new Error(`Bradbury outer transaction gas preflight ${estimatedOuterGas} (${gasPreflightMethod}) exceeds the verified 2^24 transaction/runtime gate; no deployment submitted`);
}

const json = (value) => JSON.stringify(value, (_, entry) => typeof entry === "bigint" ? entry.toString() : entry, 2);
const baseRecord = {
  version: "V2",
  network: "testnet-bradbury",
  chainId: 4221,
  genesis: "0x17d89764d4f4f963158fc4c5e8f2cb670c2837740b35f37081c12860c3df97e4",
  nodeRpc: endpoint,
  chainRpc,
  sourcePath,
  sourceBytes: sourceBytes.byteLength,
  sourceSha256,
  runner,
  deployer: account.address,
  schemaMethodNames: methodNames,
  protocolFeeEstimate: estimate.feeValue.toString(),
  feeDistribution: distribution,
  serializedDeploymentBytes: serializedDeployment.length,
  intrinsicGas: intrinsicGas.toString(),
  gasLimit: estimatedOuterGas.toString(),
  gasPreflightMethod,
  status: "preflight-passed",
};

mkdirSync(join(process.cwd(), "docs/deployments"), { recursive: true });
const txHash = String(await client.deployContract({
  account,
  code: source,
  gas: estimatedOuterGas,
  fees: {
    distribution,
    feeValue: estimate.feeValue,
    ...(estimate.messageAllocations ? { messageAllocations: estimate.messageAllocations } : {}),
  },
}));
const recordPath = join(process.cwd(), "docs/deployments", `bradbury-v2-${txHash}.json`);
writeFileSync(recordPath, `${json({ ...baseRecord, transactionHash: txHash, status: "submitted" })}\n`);
console.log(JSON.stringify({
  network: baseRecord.network,
  chainId: baseRecord.chainId,
  deployer: account.address,
  sourceSha256,
  transactionHash: txHash,
  protocolFeeEstimate: estimate.feeValue.toString(),
  gasLimit: estimatedOuterGas.toString(),
  recordPath,
}, null, 2));

const receipt = await client.waitForFinalization({ hash: txHash, fullTransaction: true, interval: 5000, retries: 180 });
const status = String(receipt.statusName ?? receipt.status ?? "");
const executionResult = String(receipt.txExecutionResultName ?? receipt.txExecutionResult ?? "");
if (status.replaceAll("_", "").toUpperCase() !== "FINALIZED" || executionResult.replaceAll("_", "").toUpperCase() !== "FINISHEDWITHRETURN") {
  writeFileSync(recordPath, `${json({ ...baseRecord, transactionHash: txHash, status, executionResult, receipt })}\n`);
  throw new Error(`Bradbury V2 deployment did not finish successfully: ${status}/${executionResult}`);
}

const address = String(receipt.recipient ?? receipt.to_address ?? "");
if (!/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/.test(address)) {
  throw new Error("Finalized deployment did not expose a nonzero deployed contract address");
}
const deployedSchema = await client.getContractSchema(address);
const deployedCode = await client.getContractCode(address);
const deployedSha256 = createHash("sha256").update(Buffer.from(deployedCode, "utf8")).digest("hex");
if (deployedSha256 !== sourceSha256) throw new Error("Bradbury deployed source hash does not match the submitted V2 source");
const protocolVersion = await client.readContract({ address, functionName: "get_protocol_version" });
const caseCount = await client.readContract({ address, functionName: "get_case_count" });
if (protocolVersion !== "COVRA_ADJUDICATOR_V2" || Number(caseCount) !== 0) throw new Error("V2 constructor/readback verification failed");

const finalRecord = {
  ...baseRecord,
  status,
  executionResult,
  transactionHash: txHash,
  contractAddress: address,
  deployedSourceSha256: deployedSha256,
  deployedSchema,
  protocolVersion,
  initialCaseCount: String(caseCount),
  receipt,
  verifiedAt: new Date().toISOString(),
};
writeFileSync(recordPath, `${json(finalRecord)}\n`);
console.log(JSON.stringify({
  status,
  executionResult,
  contractAddress: address,
  transactionHash: txHash,
  sourceSha256,
  deployedSourceSha256: deployedSha256,
  protocolVersion,
  initialCaseCount: String(caseCount),
  recordPath,
}, null, 2));
