import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { createPublicClient, encodeFunctionData, fromRlp, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { abi, createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { assertBradburyNodeIdentity, BRADBURY_PHASE_2_GENESIS } from "../src/lib/bradbury-final-state.ts";
import { makeDeploymentEnvelope } from "./bradbury-deployment-envelope.mjs";

// This is a disposable, testnet-only proof.  It never touches the V1 COVRA
// deployment or any Base Sepolia contract and it refuses to sign without the
// explicit deployment guard already required by the Bradbury scripts.
if (process.env.COVRA_ENV !== "testnet" || process.env.COVRA_DEPLOY_CONFIRM !== "TESTNET_ONLY") {
  throw new Error("Refusing staged-upgrade proof: testnet confirmation is absent");
}

const NODE_RPC = process.env.BRADBURY_NODE_RPC_URL || "https://rpc-bradbury.genlayer.com";
const CHAIN_RPC = process.env.BRADBURY_CHAIN_RPC_URL || "https://rpc.testnet-chain.genlayer.com";
const BOOTSTRAP_PATH = process.argv[2] || "testbed/staged-upgrade/StageableBootstrap.py";
const REPLACEMENT_PATH = process.argv[3] || "testbed/staged-upgrade/StageableReplacement.py";
const GAS_CAP = 1n << 24n;
const GAS_MARGIN_BPS = 11000n;
const CHUNK_SIZE = 700;
const PRAEST_ACCOUNT_NAME = process.env.BRADBURY_CLI_ACCOUNT || "praest-deployer";
const PRAEST_ACCOUNT_ADDRESS = "0x0d5540e0ad4b92aa0ad4e5f1b8cd645ee1e363e7";

const json = (value) => JSON.stringify(value, (_, entry) => typeof entry === "bigint" ? entry.toString() : entry, 2);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const normalizeStatus = (value) => String(value ?? "").replaceAll("_", "").toUpperCase();

async function runGenLayerCli(args) {
  let cliEntry = process.env.COVRA_GENLAYER_CLI_ENTRY;
  if (!cliEntry) {
    try {
      const finder = process.platform === "win32" ? "where.exe" : "which";
      const discovered = execFileSync(finder, ["genlayer"], { encoding: "utf8" })
        .split(/\r?\n/)
        .map((value) => value.trim())
        .find((value) => value.length > 0);
      if (discovered) {
        cliEntry = join(dirname(discovered), "node_modules", "genlayer", "dist", "index.js");
      }
    } catch {
      // Fall through to the conventional global npm installation path.
    }
  }
  cliEntry ||= join(process.env.APPDATA || "", "npm", "node_modules", "genlayer", "dist", "index.js");
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [cliEntry, ...args], {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code !== 0) {
        const safeTail = `${result.stdout}\n${result.stderr}`.trim().slice(-2_000);
        rejectPromise(new Error(`GenLayer CLI ${args[0]} failed${safeTail ? `: ${safeTail}` : ""}`));
      } else {
        resolvePromise(result);
      }
    });
    // Account commands and keystore-backed writes must see EOF on stdin so
    // the CLI cannot fall into an interactive password prompt unexpectedly.
    child.stdin.end();
  });
}

function extractCliTransactionHash(output, operation) {
  const match = String(output).match(new RegExp(`${operation} Transaction Hash:\\s*(0x[0-9a-fA-F]{64})`));
  if (!match) throw new Error(`GenLayer CLI did not return a ${operation.toLowerCase()} transaction identifier`);
  return match[1];
}

function cliFeeJson(fees) {
  return json({
    distribution: fees.distribution,
    feeValue: BigInt(fees.feeValue),
    ...(fees.messageAllocations ? { messageAllocations: fees.messageAllocations } : {}),
  });
}

async function ensurePraestCliAccount(expectedAddress) {
  let output = await runGenLayerCli(["account", "show", "--account", PRAEST_ACCOUNT_NAME]);
  let text = `${output.stdout}\n${output.stderr}`;
  if (!/active:\s*true/i.test(text)) {
    await runGenLayerCli(["account", "use", PRAEST_ACCOUNT_NAME]);
    output = await runGenLayerCli(["account", "show", "--account", PRAEST_ACCOUNT_NAME]);
    text = `${output.stdout}\n${output.stderr}`;
  }
  const match = text.match(/address:\s*['\"]?(0x[0-9a-fA-F]{40})/i);
  if (!match || match[1].toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(`Configured GenLayer CLI account ${PRAEST_ACCOUNT_NAME} does not match the isolated Praest address`);
  }
  if (!/status:\s*['\"]?unlocked/i.test(text)) {
    throw new Error(`Configured GenLayer CLI account ${PRAEST_ACCOUNT_NAME} is locked; no transaction submitted`);
  }
}

async function loadCliKeystoreAccount(accountName, expectedAddress) {
  const cliEntry = process.env.COVRA_GENLAYER_CLI_ENTRY || "C:/nvm4w/nodejs/node_modules/genlayer/dist/index.js";
  const require = createRequire(cliEntry);
  const keytar = require("keytar");
  let privateKey = await keytar.getPassword("genlayer-cli", `account:${accountName}`);
  if (!privateKey) throw new Error(`GenLayer CLI account ${accountName} is not unlocked in the OS keychain`);
  try {
    const account = privateKeyToAccount(privateKey);
    if (account.address.toLowerCase() !== expectedAddress.toLowerCase()) {
      throw new Error("Unlocked GenLayer CLI account does not match the isolated Praest address");
    }
    return account;
  } finally {
    privateKey = "";
  }
}

async function submitViaCli(args, operation) {
  const output = await runGenLayerCli(args);
  return extractCliTransactionHash(`${output.stdout}\n${output.stderr}`, operation);
}

async function rpc(endpoint, method, params = []) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const packet = await response.json();
  if (!response.ok || packet?.error) {
    throw new Error(`${method} failed: ${packet?.error?.message || `HTTP ${response.status}`}`);
  }
  return packet.result;
}

function findAddTransactionAbi() {
  const item = testnetBradbury.consensusMainContract.abi.find(
    (candidate) => candidate.type === "function" && candidate.name === "addTransaction",
  );
  if (!item) throw new Error("Bradbury consensus ABI does not expose addTransaction");
  return item;
}

function transactionStatus(receipt) {
  const status = normalizeStatus(receipt.statusName ?? receipt.status);
  const executionResult = normalizeStatus(receipt.txExecutionResultName ?? receipt.txExecutionResult);
  return { status, executionResult };
}

function assertSuccessfulFinalization(receipt, label) {
  const state = transactionStatus(receipt);
  if (state.status !== "FINALIZED" || state.executionResult !== "FINISHEDWITHRETURN") {
    throw new Error(`${label} did not finish successfully: ${state.status}/${state.executionResult}`);
  }
  return state;
}

function assertFinalizedCall(receipt, { address, functionName, args }, label) {
  const recipient = String(receipt?.recipient ?? receipt?.to_address ?? "").toLowerCase();
  if (recipient !== address.toLowerCase()) {
    throw new Error(`${label} receipt recipient mismatch: ${recipient}`);
  }
  const raw = String(receipt?.txCallData ?? receipt?.txCalldata ?? receipt?.txData ?? "");
  if (!raw) throw new Error(`${label} receipt did not include txCallData`);
  const parts = fromRlp(raw.startsWith("0x") ? raw : `0x${raw}`);
  if (parts.length < 1) throw new Error(`${label} receipt calldata RLP is empty`);
  const decoded = abi.calldata.decode(Uint8Array.from(Buffer.from(parts[0].slice(2), "hex")));
  const method = decoded instanceof Map ? decoded.get("") : decoded?.[""];
  if (!decoded || typeof decoded !== "object" || method !== functionName) {
    throw new Error(`${label} receipt method mismatch: ${abi.calldata.toString(decoded)}`);
  }
  if (functionName === "stage_chunk") {
    const decodedArgs = decoded instanceof Map ? decoded.get("args") : decoded.args;
    if (!Array.isArray(decodedArgs) || String(decodedArgs[0]) !== String(args[0]) ||
        String(decodedArgs[1]) !== String(args[1]) || String(decodedArgs[3]).toLowerCase() !== String(args[3]).toLowerCase()) {
      throw new Error(`${label} receipt stage manifest mismatch`);
    }
  }
}

function makeWriteEnvelope({ client, account, address, functionName, args, fees, validUntil }) {
  const call = abi.calldata.makeCalldataObject(functionName, args, undefined);
  const encodedCall = abi.calldata.encode(call);
  const txCalldata = abi.transactions.serialize([encodedCall, false]);
  const distribution = fees.distribution;
  const messageAllocations = fees.messageAllocations ?? [];
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
    messageAllocations,
  };
  return {
    outerCalldata: encodeFunctionData({
      abi: [findAddTransactionAbi()],
      functionName: "addTransaction",
      args: [params],
    }),
    txCalldata,
    distribution,
    messageAllocations,
    feeValue: BigInt(fees.feeValue),
  };
}

async function preflightGas(evm, account, data, value, label) {
  let floor;
  let method = "eth_estimateGas";
  let estimateError = null;
  try {
    floor = await evm.estimateGas({
      account: account.address,
      to: testnetBradbury.consensusMainContract.address,
      data,
      value,
    });
  } catch (error) {
    estimateError = error instanceof Error ? error.message : String(error);
  }

  if (floor === undefined) {
    method = "bounded-eth_call";
    const upper = BigInt(process.env.BRADBURY_GAS_SIMULATION_UPPER || "60000000");
    try {
      await evm.call({
        account: account.address,
        to: testnetBradbury.consensusMainContract.address,
        data,
        value,
        gas: upper,
      });
    } catch (error) {
      throw new Error(`${label} read-only gas preflight failed: ${estimateError || "eth_estimateGas failed"}; eth_call at ${upper} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    let low = 21_000n;
    let high = upper;
    while (high - low > 1024n) {
      const middle = (low + high) / 2n;
      try {
        await evm.call({
          account: account.address,
          to: testnetBradbury.consensusMainContract.address,
          data,
          value,
          gas: middle,
        });
        high = middle;
      } catch {
        low = middle;
      }
    }
    floor = high;
  }

  const gasLimit = (floor * GAS_MARGIN_BPS + 9_999n) / 10_000n;
  if (gasLimit >= GAS_CAP) {
    throw new Error(`${label} requires ${floor} gas and a ${gasLimit} gas limit with 10% headroom, at/above Bradbury's observed ${GAS_CAP} gate; no transaction submitted`);
  }
  return { method, floor, gasLimit, cap: GAS_CAP, estimateError };
}

async function getReceiptSettlementReceipts(evm, receipt) {
  const settlements = Array.isArray(receipt?.settlements) ? receipt.settlements : [];
  const result = [];
  for (const settlement of settlements) {
    const hash = settlement?.evmTransactionHash;
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(hash || ""))) continue;
    let chainReceipt = null;
    try {
      chainReceipt = await evm.getTransactionReceipt({ hash });
    } catch {
      // Keep the GenLayer receipt even when an EVM settlement receipt is not
      // indexed yet; the proof must never convert that into a success claim.
    }
    result.push({ evmTransactionHash: hash, receipt: chainReceipt });
  }
  return result;
}

async function main() {
  const key = process.env.BRADBURY_DEPLOYER_PRIVATE_KEY;
  const hasLocalKey = /^0x[0-9a-fA-F]{64}$/.test(key || "");
  const expectedCliAddress = process.env.BRADBURY_DEPLOYER_ADDRESS || PRAEST_ACCOUNT_ADDRESS;
  const useCliKeychainSigner = !hasLocalKey && process.env.COVRA_USE_CLI_KEYCHAIN_SIGNER === "1";
  if (!hasLocalKey && !useCliKeychainSigner) await ensurePraestCliAccount(expectedCliAddress);

  await assertBradburyNodeIdentity(NODE_RPC);
  const chainId = await rpc(CHAIN_RPC, "eth_chainId");
  const genesis = await rpc(CHAIN_RPC, "eth_getBlockByNumber", ["0x0", false]);
  if (chainId !== "0x107d" || genesis?.hash?.toLowerCase() !== BRADBURY_PHASE_2_GENESIS) {
    throw new Error("Bradbury EVM RPC does not match Phase 2 chain identity");
  }

  const account = hasLocalKey
    ? privateKeyToAccount(key)
    : useCliKeychainSigner
      ? await loadCliKeystoreAccount(PRAEST_ACCOUNT_NAME, expectedCliAddress)
      : { address: expectedCliAddress };
  const hasSigningAccount = hasLocalKey || useCliKeychainSigner;
  if (process.env.BRADBURY_DEPLOYER_ADDRESS && process.env.BRADBURY_DEPLOYER_ADDRESS.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error("Bradbury deployer address does not match the supplied isolated key");
  }
  const client = createClient({ chain: testnetBradbury, endpoint: NODE_RPC, account: hasSigningAccount ? account : account.address });
  const evm = createPublicClient({ transport: http(CHAIN_RPC) });
  const [addressManagerCode, feeManagerCode, balance, gasPrice] = await Promise.all([
    rpc(CHAIN_RPC, "eth_getCode", ["0x3F71AE080BD6270A91dBcc7960d88797828538E0", "latest"]),
    rpc(CHAIN_RPC, "eth_getCode", ["0x7678587A847712f2A96082AC07883A88D0fc7245", "latest"]),
    evm.getBalance({ address: account.address }),
    evm.getGasPrice(),
  ]);
  if (!addressManagerCode || addressManagerCode === "0x" || !feeManagerCode || feeManagerCode === "0x") {
    throw new Error("Bradbury AddressManager/FeeManager code preflight failed");
  }

  const bootstrapBytes = readFileSync(resolve(BOOTSTRAP_PATH));
  const replacementBytes = readFileSync(resolve(REPLACEMENT_PATH));
  const covraMode = /CovraAdjudicator\.py$/i.test(REPLACEMENT_PATH) || /CovraAdjudicator/.test(REPLACEMENT_PATH);
  const bootstrapSource = bootstrapBytes.toString("utf8");
  const replacementSource = replacementBytes.toString("utf8");
  const replacementDigest = `0x${sha256(replacementBytes)}`;
  const runner = bootstrapSource.match(/py-genlayer:[a-z0-9]+/)?.[0] || null;
  if (!runner || !replacementSource.includes(runner)) throw new Error("Proof sources do not share a pinned runner");

  const bootstrapSchema = await client.getContractSchemaForCode(bootstrapSource);
  const replacementSchema = await client.getContractSchemaForCode(replacementSource);
  const initialFeeEstimate = await client.estimateTransactionFees({});
  if (BigInt(initialFeeEstimate.feeValue) <= 0n) throw new Error("Bradbury returned a zero deployment fee estimate");
  const deploymentEnvelope = makeDeploymentEnvelope({
    source: bootstrapSource,
    sender: account.address,
    distribution: initialFeeEstimate.distribution,
    feeValue: BigInt(initialFeeEstimate.feeValue),
  });
  const deploymentGas = await preflightGas(
    evm,
    account,
    deploymentEnvelope.outerCalldata,
    BigInt(initialFeeEstimate.feeValue),
    "bootstrap deployment",
  );
  const nativeGasCost = deploymentGas.gasLimit * gasPrice;
  if (balance <= BigInt(initialFeeEstimate.feeValue) + nativeGasCost) {
    throw new Error("Bradbury deployer balance is insufficient for the protocol-fee deposit plus outer gas");
  }

  const record = {
    proof: "native-code-slot-staged-upgrade",
    proofMode: covraMode ? "covra-v2-storage-compatible-install" : "disposable-code-slot-proof",
    network: "testnet-bradbury",
    chainId: 4221,
    genesis: BRADBURY_PHASE_2_GENESIS,
    nodeRpc: NODE_RPC,
    chainRpc: CHAIN_RPC,
    runner,
    managerRuntime: "genvm-manager-v0.6.0-rc10",
    bootstrapPath: BOOTSTRAP_PATH,
    bootstrapBytes: bootstrapBytes.byteLength,
    bootstrapSha256: sha256(bootstrapBytes),
    replacementPath: REPLACEMENT_PATH,
    replacementBytes: replacementBytes.byteLength,
    replacementSha256: sha256(replacementBytes),
    replacementDigest,
    bootstrapSchema,
    replacementSchema,
    deployer: account.address,
    signingMode: hasLocalKey ? "isolated-private-key" : useCliKeychainSigner ? `genlayer-cli-keychain-in-memory:${PRAEST_ACCOUNT_NAME}` : `genlayer-cli-keystore:${PRAEST_ACCOUNT_NAME}`,
    feeManager: "0x7678587A847712f2A96082AC07883A88D0fc7245",
    gasCap: GAS_CAP,
    gasPrice,
    initialBalance: balance,
    stages: [],
    status: "preflight-passed",
    verifiedAt: new Date().toISOString(),
  };

  mkdirSync(join(process.cwd(), "docs/deployments"), { recursive: true });
  const deploymentFees = {
    distribution: initialFeeEstimate.distribution,
    feeValue: BigInt(initialFeeEstimate.feeValue),
    ...(initialFeeEstimate.messageAllocations ? { messageAllocations: initialFeeEstimate.messageAllocations } : {}),
  };
  const deploymentValidUntil = String(Math.floor(Date.now() / 1000) + 3600);
  let txId;
  if (hasSigningAccount) {
    txId = String(await client.deployContract({
      account,
      code: bootstrapSource,
      gas: deploymentGas.gasLimit,
      fees: deploymentFees,
      validUntil: BigInt(deploymentValidUntil),
    }));
  } else {
    txId = await submitViaCli([
      "deploy",
      "--contract",
      BOOTSTRAP_PATH,
      "--wallet",
      "keystore",
      "--fees",
      cliFeeJson(deploymentFees),
      "--valid-until",
      deploymentValidUntil,
    ], "Deployment");
  }
  record.bootstrapDeployment = { transactionId: txId, gasPreflight: deploymentGas, feeValue: initialFeeEstimate.feeValue };
  let receipt = await client.waitForFinalization({ hash: txId, fullTransaction: true, interval: 5_000, retries: 180 });
  assertSuccessfulFinalization(receipt, "bootstrap deployment");
  const bootstrapAddress = String(receipt.recipient ?? receipt.to_address ?? "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(bootstrapAddress) || /^0x0{40}$/i.test(bootstrapAddress)) throw new Error("Bootstrap deployment returned no contract address");
  const bootstrapCode = await client.getContractCode(bootstrapAddress);
  if (sha256(Buffer.from(bootstrapCode, "utf8")) !== sha256(bootstrapBytes)) throw new Error("Bootstrap source readback mismatch");
  record.bootstrapDeployment.contractAddress = bootstrapAddress;
  record.bootstrapDeployment.receipt = receipt;
  record.bootstrapDeployment.settlementReceipts = await getReceiptSettlementReceipts(evm, receipt);
  record.status = "bootstrap-finalized";
  const recordPath = join(process.cwd(), "docs/deployments", `staged-upgrade-proof-${txId}.json`);
  writeFileSync(recordPath, `${json(record)}\n`);

  const read = async (functionName, args = []) => client.readContract({ address: bootstrapAddress, functionName, args });
  record.initialState = {
    status: await read("get_installation_status"),
    installer: await read("get_installer"),
    codeSlot: await read("get_code_slot"),
  };
  if (covraMode) {
    record.initialState.owner = await read("get_owner");
    record.initialState.caseCount = await read("get_case_count");
  } else {
    record.initialState.counter = await read("get_counter");
    record.initialState.marker = await read("get_marker");
  }

  async function writeAndFinalize(functionName, args, label) {
    const fees = await client.estimateTransactionFeesForWrite({ address: bootstrapAddress, functionName, args });
    if (BigInt(fees.feeValue) <= 0n) throw new Error(`${label}: FeeManager returned zero protocol fee`);
    const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const envelope = makeWriteEnvelope({ client, account, address: bootstrapAddress, functionName, args, fees, validUntil });
    const gas = await preflightGas(evm, account, envelope.outerCalldata, envelope.feeValue, label);
    const stage = { label, functionName, argsSummary: functionName === "stage_chunk" ? { index: String(args[0]), totalChunks: String(args[1]), bytes: args[2].length, sourceDigest: args[3] } : args.map((value) => typeof value === "bigint" ? value.toString() : value), gasPreflight: gas, feeValue: fees.feeValue, status: "preflight-passed" };
    const writeFees = {
      distribution: fees.distribution,
      feeValue: BigInt(fees.feeValue),
      ...(fees.messageAllocations ? { messageAllocations: fees.messageAllocations } : {}),
    };
    // Persist the intent before signing.  If the process is interrupted while
    // the RPC request is in flight, the durable record still identifies the
    // exact function, arguments, gas and fee envelope to reconcile before any
    // retry.  A resumed operator must never infer success from this state.
    record.stages.push(stage);
    writeFileSync(recordPath, `${json(record)}\n`);
    let writeTxId;
    if (hasSigningAccount) {
      // Recreate the account-aware client for every broadcast.  rc.2 keeps a
      // public-client nonce snapshot; after a deployment or an interrupted
      // write, reusing that snapshot can address the wrong outer nonce.  A
      // fresh client resolves the current nonce while keeping the signer only
      // in memory.
      const signingClient = createClient({ chain: testnetBradbury, endpoint: NODE_RPC, account });
      writeTxId = String(await signingClient.writeContract({
        account,
        address: bootstrapAddress,
        functionName,
        args,
        gas: gas.gasLimit,
        fees: writeFees,
        validUntil,
      }));
    } else {
      const cliArgs = functionName === "stage_chunk"
        ? [String(args[0]), String(args[1]), `b#${Buffer.from(args[2]).toString("hex")}`, String(args[3])]
        : args.map((value) => typeof value === "bigint" ? value.toString() : String(value));
      writeTxId = await submitViaCli([
        "write",
        bootstrapAddress,
        functionName,
        "--wallet",
        "keystore",
        "--fees",
        cliFeeJson(writeFees),
        "--valid-until",
        String(validUntil),
        "--args",
        ...cliArgs,
      ], "Write");
    }
    stage.transactionId = writeTxId;
    receipt = await client.waitForFinalization({ hash: writeTxId, fullTransaction: true, interval: 5_000, retries: 180 });
    const state = assertSuccessfulFinalization(receipt, label);
    assertFinalizedCall(receipt, { address: bootstrapAddress, functionName, args }, label);
    stage.status = state.status;
    stage.executionResult = state.executionResult;
    stage.receipt = receipt;
    stage.settlementReceipts = await getReceiptSettlementReceipts(evm, receipt);
    writeFileSync(recordPath, `${json(record)}\n`);
    return writeTxId;
  }

  if (!covraMode) {
    await writeAndFinalize("increment", [2n], "bootstrap counter write");
    record.afterCounterWrite = { counter: await read("get_counter"), marker: await read("get_marker") };
  }

  const chunks = [];
  for (let offset = 0; offset < replacementBytes.length; offset += CHUNK_SIZE) {
    chunks.push(Uint8Array.from(replacementBytes.subarray(offset, offset + CHUNK_SIZE)));
  }
  for (let index = 0; index < chunks.length; index += 1) {
    await writeAndFinalize("stage_chunk", [BigInt(index), BigInt(chunks.length), chunks[index], replacementDigest], `stage chunk ${index + 1}/${chunks.length}`);
    if (index === 0 || index === chunks.length - 1) {
      record[`afterChunk${index + 1}`] = await read("get_installation_status");
      writeFileSync(recordPath, `${json(record)}\n`);
    }
  }
  const activationTx = await writeAndFinalize("activate", [], "atomic code-slot activation");
  if (covraMode) {
    try {
      record.afterActivation = {
        status: JSON.parse(await read("get_installation_status")),
        codeSlot: await read("get_code_slot"),
      };
    } catch {
      // COVRA V2 deliberately removes the bootstrap methods after the atomic
      // switch.  The activation receipt and exact digest are the durable
      // status proof; unlike the disposable replacement, V2 does not expose a
      // diagnostic code-slot getter after activation.
      record.afterActivation = {
        status: {
          activated: true,
          expected_digest: replacementDigest,
          total_chunks: chunks.length,
          next_chunk: chunks.length,
          staged_bytes: replacementBytes.length,
          activation_digest: replacementDigest,
          readback: "reconstructed from finalized activate receipt because installer methods are removed after activation",
        },
        codeSlot: "not-exposed-after-activation",
        activationTransactionId: activationTx,
      };
    }
  } else {
    record.afterActivation = {
      status: JSON.parse(await read("get_installation_status")),
      codeSlot: await read("get_code_slot"),
      activationTransactionId: activationTx,
    };
  }
  if (covraMode) {
    record.afterActivation.protocolVersion = await client.readContract({ address: bootstrapAddress, functionName: "get_protocol_version" });
    record.afterActivation.caseCount = await client.readContract({ address: bootstrapAddress, functionName: "get_case_count" });
    record.afterActivation.unknownDecisionDigest = await client.readContract({ address: bootstrapAddress, functionName: "get_decision_digest", args: [`0x${"0".repeat(64)}`] });
  } else {
    record.afterActivation.marker = await read("get_marker");
    record.afterActivation.counter = await read("get_counter");
    record.afterActivation.version = await client.readContract({ address: bootstrapAddress, functionName: "get_version" });
  }
  const activeCode = await client.getContractCode(bootstrapAddress);
  record.defaultCodeSlotReadbackSha256 = sha256(Buffer.from(activeCode, "utf8"));
  record.resolvedCodeEvidence = {
    replacementSha256: record.replacementSha256,
    activationDigest: record.afterActivation.status.activation_digest,
    codeSlot: String(record.afterActivation.codeSlot),
    note: "Bradbury gen_getContractCode returns the root/default code slot; the resolved alternate slot was verified by the finalized activation digest and replacement-only method readbacks.",
  };
  if (covraMode) {
    let removedInstallerRejected = false;
    try {
      await client.readContract({ address: bootstrapAddress, functionName: "stage_chunk", args: [0n, 1n, Uint8Array.from([0]), replacementDigest] });
    } catch {
      removedInstallerRejected = true;
    }
    if ((record.afterActivation.codeSlot !== "not-exposed-after-activation" && BigInt(record.afterActivation.codeSlot) === 0n) || record.afterActivation.protocolVersion !== "COVRA_ADJUDICATOR_V2" || Number(record.afterActivation.caseCount) !== 0 || record.afterActivation.unknownDecisionDigest !== "" || !removedInstallerRejected) {
      throw new Error("Resolved COVRA V2 code did not pass protocol, empty-state or installer-removal checks");
    }
    record.activeMethodChecks = { protocolVersion: record.afterActivation.protocolVersion, caseCount: record.afterActivation.caseCount, unknownDecisionDigest: record.afterActivation.unknownDecisionDigest, removedStageChunkRejected: removedInstallerRejected };
  } else {
    let removedInstallerRejected = false;
    try {
      await client.readContract({ address: bootstrapAddress, functionName: "stage_chunk", args: [0n, 1n, Uint8Array.from([0]), replacementDigest] });
    } catch {
      removedInstallerRejected = true;
    }
    if (record.afterActivation.version !== "replacement-v2" || !removedInstallerRejected) throw new Error("Active replacement checks failed");
    record.activeMethodChecks = { version: record.afterActivation.version, removedStageChunkRejected: removedInstallerRejected };
    await writeAndFinalize("increment", [3n], "replacement counter write");
    record.afterReplacementWrite = { counter: await read("get_counter"), version: await client.readContract({ address: bootstrapAddress, functionName: "get_version" }), activeCodeSha256: record.replacementSha256 };
  }
  record.status = "staged-upgrade-finalized-and-verified";
  record.completedAt = new Date().toISOString();
  writeFileSync(recordPath, `${json(record)}\n`);
  console.log(json({
    status: record.status,
    bootstrapAddress,
    bootstrapDeploymentTransactionId: record.bootstrapDeployment.transactionId,
    replacementSha256: record.replacementSha256,
    activeCodeSha256: record.activeCodeSha256,
    codeSlot: record.afterActivation.codeSlot,
    stageTransactions: record.stages.map((stage) => ({ label: stage.label, transactionId: stage.transactionId, gasLimit: stage.gasPreflight.gasLimit, executionResult: stage.executionResult })),
    recordPath,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
