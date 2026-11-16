/*
 * Configure the already-deployed COVRA V2 adjudicator's evidence host.
 *
 * This is a narrowly scoped, testnet-only owner operation. It never creates a
 * policy, locks a claim, moves USDC, or changes the Base pool. The durable
 * record makes an interrupted broadcast recoverable and refuses to submit a
 * second transaction after a finalized receipt exists.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { abi, createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";
import { assertBradburyNodeIdentity, BRADBURY_PHASE_2_GENESIS, readFinalizedBradburyView } from "../src/lib/bradbury-final-state.ts";

if (process.env.COVRA_ENV !== "testnet" || process.env.COVRA_DEPLOY_CONFIRM !== "TESTNET_ONLY") {
  throw new Error("Refusing V2 host configuration outside the explicit COVRA testnet guard");
}

const NODE_RPC = process.env.BRADBURY_NODE_RPC_URL || "https://rpc-bradbury.genlayer.com";
const ADJUDICATOR = "0x71B1Fb863F29c29D4C3f6423196b60589538E491";
const HOST = "covra-lyart.vercel.app";
const RECORD_PATH = resolve("docs/deployments/bradbury-v2-evidence-host.json");
const ACCOUNT_NAME = process.env.BRADBURY_CLI_ACCOUNT || "praest-deployer";
const EXPECTED_ACCOUNT = (process.env.BRADBURY_DEPLOYER_ADDRESS || "0x0d5540e0ad4b92aa0ad4e5f1b8cd645ee1e363e7").toLowerCase();

const json = (value) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);

async function rpc(method, params = []) {
  const response = await fetch(NODE_RPC, {
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

async function loadAccount() {
  const cliEntry = process.env.COVRA_GENLAYER_CLI_ENTRY || "C:/nvm4w/nodejs/node_modules/genlayer/dist/index.js";
  const require = createRequire(cliEntry);
  const keytar = require("keytar");
  let privateKey = await keytar.getPassword("genlayer-cli", `account:${ACCOUNT_NAME}`);
  if (!privateKey) throw new Error(`GenLayer CLI account ${ACCOUNT_NAME} is not unlocked in the OS keychain`);
  try {
    const account = privateKeyToAccount(privateKey);
    if (account.address.toLowerCase() !== EXPECTED_ACCOUNT) throw new Error("Unlocked account does not match the isolated Praest address");
    return account;
  } finally {
    privateKey = "";
  }
}

async function finalized(txId) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const receipt = await rpc("gen_getTransactionReceipt", [{ txId }]);
    if (receipt?.statusName === "Finalized" || receipt?.status === 7) return receipt;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
  }
  throw new Error(`Timed out waiting for Bradbury finalization of ${txId}`);
}

function verifyReceipt(receipt) {
  const status = String(receipt.statusName || receipt.status).replaceAll("_", "").toUpperCase();
  const execution = String(receipt.txExecutionResultName || receipt.txExecutionResult).replaceAll("_", "").toUpperCase();
  if (status !== "FINALIZED" || execution !== "FINISHEDWITHRETURN") {
    throw new Error(`V2 evidence-host write failed: ${status}/${execution}`);
  }
  if (String(receipt.recipient || "").toLowerCase() !== ADJUDICATOR.toLowerCase()) throw new Error("V2 evidence-host recipient mismatch");
  return { status: receipt.statusName, executionResult: receipt.txExecutionResultName };
}

const existing = existsSync(RECORD_PATH) ? JSON.parse(readFileSync(RECORD_PATH, "utf8")) : null;
if (existing?.transactionId) {
  const receipt = await finalized(existing.transactionId);
  const state = verifyReceipt(receipt);
  const updated = { ...existing, ...state, receipt, verifiedAt: new Date().toISOString() };
  writeFileSync(RECORD_PATH, `${json(updated)}\n`, "utf8");
  console.log(json({ status: "already-configured", ...state, transactionId: existing.transactionId, host: HOST, adjudicator: ADJUDICATOR }));
  process.exit(0);
}

const account = await loadAccount();
await assertBradburyNodeIdentity(NODE_RPC);
const chainId = await rpc("eth_chainId");
if (Number.parseInt(chainId, 16) !== 4221) throw new Error("Bradbury chain identity mismatch");
const genesis = await rpc("eth_getBlockByNumber", ["0x0", false]);
if (String(genesis?.hash || "").toLowerCase() !== BRADBURY_PHASE_2_GENESIS) throw new Error("Bradbury genesis mismatch");

const client = createClient({ chain: testnetBradbury, endpoint: NODE_RPC, account });
const protocolVersion = await readFinalizedBradburyView(NODE_RPC, ADJUDICATOR, "get_protocol_version", []);
if (String(protocolVersion) !== "COVRA_ADJUDICATOR_V2") throw new Error("Configured address is not the deployed COVRA V2 adjudicator");
const fees = await client.estimateTransactionFeesForWrite({ address: ADJUDICATOR, functionName: "allow_evidence_host", args: [HOST, true] });
if (BigInt(fees.feeValue) <= 0n) throw new Error("FeeManager returned a zero protocol fee");
const record = {
  network: "testnet-bradbury",
  chainId: 4221,
  genesis: BRADBURY_PHASE_2_GENESIS,
  adjudicator: ADJUDICATOR,
  caller: account.address,
  method: "allow_evidence_host",
  args: [HOST, true],
  feeManager: testnetBradbury.feeManagerContract.address,
  feeValue: String(fees.feeValue),
  distribution: fees.distribution,
  status: "intent-persisted",
  transactionSubmitted: false,
};
writeFileSync(RECORD_PATH, `${json(record)}\n`, "utf8");
const txId = String(await client.writeContract({
  account,
  address: ADJUDICATOR,
  functionName: "allow_evidence_host",
  args: [HOST, true],
  fees: { distribution: fees.distribution, feeValue: BigInt(fees.feeValue), ...(fees.messageAllocations ? { messageAllocations: fees.messageAllocations } : {}) },
}));
record.transactionId = txId;
record.transactionSubmitted = true;
record.status = "submitted";
writeFileSync(RECORD_PATH, `${json(record)}\n`, "utf8");
const receipt = await finalized(txId);
const state = verifyReceipt(receipt);
const completed = { ...record, ...state, receipt, completedAt: new Date().toISOString() };
writeFileSync(RECORD_PATH, `${json(completed)}\n`, "utf8");
console.log(json({ status: "configured", ...state, transactionId: txId, host: HOST, adjudicator: ADJUDICATOR }));
