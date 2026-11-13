/**
 * Resume the already-deployed disposable native code-slot proof.
 *
 * The first live run deliberately used the GenLayer CLI keystore path and
 * discovered that the CLI's scalar parser converts a `0x...` digest argument
 * into a bigint.  The bootstrap correctly rejected that malformed argument.
 * This continuation uses the same unlocked CLI keystore account in memory
 * through the OS keychain and the pinned genlayer-js client, so the typed
 * string/bytes calldata is preserved.  The key is never written or printed.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { abi, createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { createPublicClient, encodeFunctionData, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { assertBradburyNodeIdentity, BRADBURY_PHASE_2_GENESIS } from "../src/lib/bradbury-final-state.ts";

if (process.env.COVRA_ENV !== "testnet" || process.env.COVRA_DEPLOY_CONFIRM !== "TESTNET_ONLY") {
  throw new Error("Refusing staged-upgrade continuation: testnet confirmation is absent");
}

const NODE_RPC = process.env.BRADBURY_NODE_RPC_URL || "https://rpc-bradbury.genlayer.com";
const CHAIN_RPC = process.env.BRADBURY_CHAIN_RPC_URL || "https://rpc.testnet-chain.genlayer.com";
const ACCOUNT_NAME = process.env.BRADBURY_CLI_ACCOUNT || "praest-deployer";
const EXPECTED_ACCOUNT = (process.env.BRADBURY_DEPLOYER_ADDRESS || "0x0d5540e0ad4b92aa0ad4e5f1b8cd645ee1e363e7").toLowerCase();
const BOOTSTRAP = "0x1452641F37cd59C797514f997bf6d6D5fe9DFD3C";
const FAILED_CLI_TX = "0x799b1e55fc40378b973b79fd98809e7e5a5ff447d59e6a80713dd24e85a136bc";
const RECORD_PATH = resolve(process.argv[2] || "docs/deployments/staged-upgrade-proof-0x5d6dc94c41f5d0a0dc37d06b937d4624a1d045d67f110061cd6a32c35e4e0e53.json");
const REPLACEMENT_PATH = resolve(process.argv[3] || "testbed/staged-upgrade/StageableReplacement.py");
const GAS_CAP = 1n << 24n;
const GAS_MARGIN_BPS = 11000n;
const CHUNK_SIZE = 700;

const json = (value) => JSON.stringify(value, (_, entry) => typeof entry === "bigint" ? entry.toString() : entry, 2);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const normalize = (value) => String(value ?? "").replaceAll("_", "").toUpperCase();

async function rpc(endpoint, method, params = []) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const packet = await response.json();
  if (!response.ok || packet?.error) throw new Error(`${method} failed: ${packet?.error?.message || `HTTP ${response.status}`}`);
  return packet.result;
}

async function waitForGenReceipt(txId, retries = 180) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const receipt = await rpc(NODE_RPC, "gen_getTransactionReceipt", [{ txId }]);
    if (receipt?.statusName === "Finalized" || receipt?.status === 7) return receipt;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
  }
  throw new Error(`Timed out waiting for Bradbury finalization of ${txId}`);
}

async function loadKeychainAccount() {
  const cliPackage = process.env.COVRA_GENLAYER_CLI_ENTRY || "C:/nvm4w/nodejs/node_modules/genlayer/dist/index.js";
  const require = createRequire(cliPackage);
  const keytar = require("keytar");
  let privateKey = await keytar.getPassword("genlayer-cli", `account:${ACCOUNT_NAME}`);
  if (!privateKey) throw new Error(`GenLayer CLI account ${ACCOUNT_NAME} is not unlocked in the OS keychain`);
  try {
    const account = privateKeyToAccount(privateKey);
    if (account.address.toLowerCase() !== EXPECTED_ACCOUNT) {
      throw new Error("Unlocked GenLayer CLI account does not match the isolated Praest address");
    }
    return account;
  } finally {
    privateKey = "";
  }
}

function consensusAddTransactionAbi() {
  const item = testnetBradbury.consensusMainContract.abi.find(
    (candidate) => candidate.type === "function" && candidate.name === "addTransaction",
  );
  if (!item) throw new Error("Bradbury consensus ABI does not expose addTransaction");
  return item;
}

function makeWriteEnvelope({ client, account, address, functionName, args, fees, validUntil }) {
  const call = abi.calldata.makeCalldataObject(functionName, args, undefined);
  const encodedCall = abi.calldata.encode(call);
  const txCalldata = abi.transactions.serialize([encodedCall, false]);
  const distribution = fees.distribution;
  const params = {
    sender: account.address,
    recipient: address,
    numOfInitialValidators: BigInt(client.chain.defaultNumberOfInitialValidators),
    maxRotations: BigInt(client.chain.defaultConsensusMaxRotations),
    validUntil,
    saltNonce: 0n,
    userValue: 0n,
    feesDistribution: distribution,
    txCalldata,
    messageAllocations: fees.messageAllocations ?? [],
  };
  return {
    outerCalldata: encodeFunctionData({
      abi: [consensusAddTransactionAbi()],
      functionName: "addTransaction",
      args: [params],
    }),
    feeValue: BigInt(fees.feeValue),
  };
}

async function preflightGas(evm, account, data, value, label) {
  let floor;
  let method = "eth_estimateGas";
  let estimateError = null;
  try {
    floor = await evm.estimateGas({ account: account.address, to: testnetBradbury.consensusMainContract.address, data, value });
  } catch (error) {
    estimateError = error instanceof Error ? error.message : String(error);
  }
  if (floor === undefined) {
    method = "bounded-eth_call";
    const upper = BigInt(process.env.BRADBURY_GAS_SIMULATION_UPPER || "60000000");
    await evm.call({ account: account.address, to: testnetBradbury.consensusMainContract.address, data, value, gas: upper });
    let low = 21_000n;
    let high = upper;
    while (high - low > 1024n) {
      const middle = (low + high) / 2n;
      try {
        await evm.call({ account: account.address, to: testnetBradbury.consensusMainContract.address, data, value, gas: middle });
        high = middle;
      } catch {
        low = middle;
      }
    }
    floor = high;
  }
  const gasLimit = (floor * GAS_MARGIN_BPS + 9_999n) / 10_000n;
  if (gasLimit >= GAS_CAP) throw new Error(`${label} requires ${floor} gas and exceeds the observed Bradbury gate with margin`);
  return { method, floor, gasLimit, cap: GAS_CAP, estimateError };
}

function receiptState(receipt) {
  return {
    status: normalize(receipt.statusName ?? receipt.status),
    executionResult: normalize(receipt.txExecutionResultName ?? receipt.txExecutionResult),
  };
}

function requireSuccess(receipt, label) {
  const state = receiptState(receipt);
  if (state.status !== "FINALIZED" || state.executionResult !== "FINISHEDWITHRETURN") {
    throw new Error(`${label} did not finish successfully: ${state.status}/${state.executionResult}`);
  }
  return state;
}

async function main() {
  const record = JSON.parse(readFileSync(RECORD_PATH, "utf8"));
  if (record.bootstrapDeployment?.contractAddress?.toLowerCase() !== BOOTSTRAP.toLowerCase()) {
    throw new Error("The continuation record does not identify the already-deployed disposable bootstrap");
  }
  if (record.network !== "testnet-bradbury" || record.chainId !== 4221 || record.genesis.toLowerCase() !== BRADBURY_PHASE_2_GENESIS) {
    throw new Error("Continuation record is not for Bradbury Phase 2");
  }
  const replacementBytes = readFileSync(REPLACEMENT_PATH);
  if (sha256(replacementBytes) !== record.replacementSha256) throw new Error("Replacement source hash differs from the recorded proof artifact");
  const replacementDigest = `0x${record.replacementSha256}`;
  const account = await loadKeychainAccount();
  await assertBradburyNodeIdentity(NODE_RPC);
  const evm = createPublicClient({ transport: http(CHAIN_RPC) });
  const chainId = await evm.getChainId();
  const genesis = await evm.getBlock({ blockNumber: 0n });
  if (chainId !== 4221 || genesis.hash?.toLowerCase() !== BRADBURY_PHASE_2_GENESIS) throw new Error("Bradbury EVM identity mismatch");
  const client = createClient({ chain: testnetBradbury, endpoint: NODE_RPC, account });
  const bootstrapCode = await client.getContractCode(BOOTSTRAP);
  if (sha256(Buffer.from(bootstrapCode, "utf8")) !== record.bootstrapSha256) throw new Error("Live bootstrap source no longer matches the recorded artifact");

  const failedReceipt = await waitForGenReceipt(FAILED_CLI_TX, 2);
  const failedState = receiptState(failedReceipt);
  if (failedState.status !== "FINALIZED" || failedState.executionResult !== "FINISHEDWITHERROR") throw new Error("Recorded malformed CLI transaction is no longer the expected finalized failure");
  record.failedAttempts ??= [];
  if (!record.failedAttempts.some((entry) => entry.transactionId?.toLowerCase() === FAILED_CLI_TX.toLowerCase())) {
    record.failedAttempts.push({
      label: "CLI digest scalar negative control",
      transactionId: FAILED_CLI_TX,
      status: failedState.status,
      executionResult: failedState.executionResult,
      reason: "GenVM trace returned [EXPECTED] invalid source digest: the CLI scalar parser converted the 0x-prefixed digest into a bigint. No chunk state was committed.",
    });
  }

  const read = (functionName, args = []) => client.readContract({ address: BOOTSTRAP, functionName, args });
  const persist = () => writeFileSync(RECORD_PATH, `${json(record)}\n`);
  // A process interruption after broadcast is recoverable.  Reconcile every
  // submitted stage before looking at the live cursor, so a resumed run never
  // submits the same chunk twice.
  for (const stage of record.stages || []) {
    if (stage.status !== "submitted" || !stage.transactionId) continue;
    const submittedReceipt = await waitForGenReceipt(stage.transactionId);
    const submittedState = receiptState(submittedReceipt);
    if (submittedState.executionResult !== "FINISHEDWITHRETURN") {
      throw new Error(`Recorded submitted stage ${stage.label} finalized unsuccessfully: ${submittedState.executionResult}`);
    }
    stage.status = submittedState.status;
    stage.executionResult = submittedState.executionResult;
    stage.receipt = submittedReceipt;
    persist();
  }

  const initialStatus = JSON.parse(await read("get_installation_status"));
  const initialCounter = await read("get_counter");
  const alreadyActivated = Boolean(initialStatus.activated);
  if ((!alreadyActivated && (Number(initialStatus.next_chunk) > 3 || Number(initialStatus.staged_bytes) > Number(record.replacementBytes))) || Number(initialCounter) !== 2) {
    throw new Error("Live bootstrap is not in a valid recoverable pre-activation state; refusing to continue");
  }
  if (alreadyActivated && String(initialStatus.activation_digest).toLowerCase() !== replacementDigest.toLowerCase()) {
    throw new Error("Live alternate-code activation digest does not match the recorded replacement artifact");
  }

  record.resume = { startedAt: new Date().toISOString(), account: account.address, signingMode: "genlayer-cli-keychain-in-memory", initialStatus, initialCounter: String(initialCounter) };
  persist();

  async function writeAndFinalize(functionName, args, label) {
    const fees = await client.estimateTransactionFeesForWrite({ address: BOOTSTRAP, functionName, args });
    if (BigInt(fees.feeValue) <= 0n) throw new Error(`${label}: zero protocol fee estimate`);
    const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const envelope = makeWriteEnvelope({ client, account, address: BOOTSTRAP, functionName, args, fees, validUntil });
    const gas = await preflightGas(evm, account, envelope.outerCalldata, envelope.feeValue, label);
    const stage = {
      label,
      functionName,
      argsSummary: functionName === "stage_chunk"
        ? { index: String(args[0]), totalChunks: String(args[1]), bytes: args[2].length, sourceDigest: args[3] }
        : args.map((value) => typeof value === "bigint" ? value.toString() : value),
      gasPreflight: gas,
      feeValue: fees.feeValue,
      status: "preflight-passed",
    };
    record.stages.push(stage);
    persist();
    // rc.2 can retain a stale public-client nonce after a deployment or an
    // interrupted write.  Resolve a fresh account-aware client for each
    // broadcast so resumptions never reuse an outer nonce.
    const signingClient = createClient({ chain: testnetBradbury, endpoint: NODE_RPC, account });
    const txId = String(await signingClient.writeContract({ account, address: BOOTSTRAP, functionName, args, gas: gas.gasLimit, fees: { distribution: fees.distribution, feeValue: BigInt(fees.feeValue), ...(fees.messageAllocations ? { messageAllocations: fees.messageAllocations } : {}) }, validUntil }));
    stage.transactionId = txId;
    stage.status = "submitted";
    persist();
    const receipt = await waitForGenReceipt(txId);
    const state = requireSuccess(receipt, label);
    stage.status = state.status;
    stage.executionResult = state.executionResult;
    stage.receipt = receipt;
    persist();
    return txId;
  }

  const chunks = [];
  for (let offset = 0; offset < replacementBytes.length; offset += CHUNK_SIZE) chunks.push(Uint8Array.from(replacementBytes.subarray(offset, offset + CHUNK_SIZE)));
  if (!alreadyActivated) {
    const start = Number(initialStatus.next_chunk);
    for (let index = start; index < chunks.length; index += 1) {
      await writeAndFinalize("stage_chunk", [BigInt(index), BigInt(chunks.length), chunks[index], replacementDigest], `stage chunk ${index + 1}/${chunks.length}`);
      record[`afterChunk${index + 1}`] = JSON.parse(await read("get_installation_status"));
      persist();
    }
    await writeAndFinalize("activate", [], "atomic code-slot activation");
  }
  record.afterActivation = {
    status: JSON.parse(await read("get_installation_status")),
    codeSlot: await read("get_code_slot"),
    marker: await read("get_marker"),
    counter: await read("get_counter"),
    version: await client.readContract({ address: BOOTSTRAP, functionName: "get_version" }),
  };
  const activeCode = await client.getContractCode(BOOTSTRAP);
  record.defaultCodeSlotReadbackSha256 = sha256(Buffer.from(activeCode, "utf8"));
  record.resolvedCodeEvidence = {
    replacementSha256: record.replacementSha256,
    activationDigest: record.afterActivation.status.activation_digest,
    codeSlot: String(record.afterActivation.codeSlot),
    note: "Bradbury gen_getContractCode returns the root/default code slot; the resolved alternate slot was verified by the finalized activation digest, the replacement-only get_version method, and rejection of the removed stage_chunk method.",
  };
  const version = await client.readContract({ address: BOOTSTRAP, functionName: "get_version" });
  if (version !== "replacement-v2") throw new Error("Resolved alternate code did not expose replacement-v2");
  let removedMethodRejected = false;
  try {
    await client.readContract({ address: BOOTSTRAP, functionName: "stage_chunk", args: [0n, 1n, Uint8Array.from([0]), replacementDigest] });
  } catch {
    removedMethodRejected = true;
  }
  if (!removedMethodRejected) throw new Error("Removed installer method remained callable after activation");
  record.activeMethodChecks = { getVersion: version, removedStageChunkRejected: removedMethodRejected, expectedReplacementMethods: Object.keys(record.replacementSchema.methods || {}).sort() };

  if (!record.stages.some((stage) => stage.label === "replacement counter write" && stage.executionResult === "FINISHEDWITHRETURN")) {
    await writeAndFinalize("increment", [3n], "replacement counter write");
  }
  record.afterReplacementWrite = { counter: await read("get_counter"), version: await client.readContract({ address: BOOTSTRAP, functionName: "get_version" }), activeCodeSha256: record.activeCodeSha256 };
  record.status = "staged-upgrade-finalized-and-verified";
  record.completedAt = new Date().toISOString();
  persist();
  console.log(json({ status: record.status, bootstrapAddress: BOOTSTRAP, replacementSha256: record.replacementSha256, activeCodeSha256: record.activeCodeSha256, codeSlot: record.afterActivation.codeSlot, failedCliTransaction: FAILED_CLI_TX, stageTransactions: record.stages.map((stage) => ({ label: stage.label, transactionId: stage.transactionId, gasLimit: stage.gasPreflight?.gasLimit, executionResult: stage.executionResult })), recordPath: RECORD_PATH }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
