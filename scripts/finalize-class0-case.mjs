/**
 * Safe operator procedure for the first class-0 pilot.
 *
 * Default mode is read-only. The --broadcast path is deliberately gated by
 * the exact case ID, the original no-appeal state, a fresh Bradbury Phase 2
 * identity check, the complete 72-hour window, and a nonzero fee estimate.
 * Run with: node --experimental-strip-types --env-file=.env.local scripts/finalize-class0-case.mjs
 * Broadcast only after the gate opens: ... --broadcast --confirm-case <case-id>
 */
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";
import { assertExactBradburyReceipt } from "../src/lib/bradbury-receipt.ts";
import { assertBradburyNodeIdentity, readFinalizedBradburyView } from "../src/lib/bradbury-final-state.ts";
import { finalizationReadiness } from "../src/lib/finalization-window.ts";

const CASE_ID = "0xc9ba090e3706d89d43faa1cde6afe0cb2d1b0cb961cf0d9105073addea127223";
const POLICY_ID = "0x888bc262dc251cda642d6843a3d69e94d403871a88ee8e570c04f6c4be7eafcd";
const ADJUDICATOR = "0xaefc8672272392310a2ea102787e28bb1f34e1d3";
const BRADBURY_CHAIN_ID = 4221;
const BRADBURY_GENESIS = "0x17d89764d4f4f963158fc4c5e8f2cb670c2837740b35f37081c12860c3df97e4";
const NODE_ENDPOINT = process.env.BRADBURY_NODE_RPC_URL || "https://rpc-bradbury.genlayer.com";
const args = new Set(process.argv.slice(2));
const broadcast = args.has("--broadcast");
const confirmationIndex = process.argv.indexOf("--confirm-case");
const confirmation = confirmationIndex >= 0 ? process.argv[confirmationIndex + 1] : "";

if (process.env.COVRA_ENV !== "testnet" || process.env.COVRA_DEPLOY_CONFIRM !== "TESTNET_ONLY") {
  throw new Error("Only the configured COVRA testnet environment is permitted");
}
if (broadcast && confirmation !== CASE_ID) {
  throw new Error("Broadcast requires --confirm-case with the exact class-0 case ID");
}

const json = (value) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);

function unwrap(value) {
  if (value instanceof Map) return value.get("") ?? value.get("result") ?? value;
  return value;
}

async function readCase() {
  const raw = await readFinalizedBradburyView(NODE_ENDPOINT, ADJUDICATOR, "get_case", [CASE_ID]);
  const value = unwrap(raw);
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function readDecisionDigest() {
  const raw = await readFinalizedBradburyView(NODE_ENDPOINT, ADJUDICATOR, "get_decision_digest", [CASE_ID]);
  const value = unwrap(raw);
  return typeof value === "string" ? value : JSON.stringify(value);
}

await assertBradburyNodeIdentity(NODE_ENDPOINT);
let record = await readCase();
if (String(record?.id || "").toLowerCase() !== CASE_ID) throw new Error("Bradbury returned a different case ID");
if (String(record?.policy_id || "").toLowerCase() !== POLICY_ID) throw new Error("Bradbury case is bound to a different Base policy");
if (String(record?.claim_id || "").toLowerCase() !== CASE_ID) throw new Error("Bradbury case claim binding is not the expected Base claim ID");

const state = String(record?.state || "").toUpperCase();
if (state === "FINALIZED") {
  console.log(json({
    mode: "READ_ONLY",
    status: "ALREADY_FINALIZED",
    network: { chainId: BRADBURY_CHAIN_ID, genesis: BRADBURY_GENESIS, endpoint: NODE_ENDPOINT },
    adjudicator: ADJUDICATOR,
    caseId: CASE_ID,
    verdict: record.verdict,
    finalizedAt: record.finalized_at,
    decisionDigest: await readDecisionDigest(),
  }));
  process.exit(0);
}
if (String(record?.verdict || "").toUpperCase() !== "INSUFFICIENT_EVIDENCE" || Number(record?.revision) !== 0 || record?.appeal_used === true) {
  throw new Error("The original class-0 case changed through an appeal or verdict revision; do not use this no-appeal procedure");
}

const nowSeconds = Math.floor(Date.now() / 1000);
const gate = finalizationReadiness(record, nowSeconds);
const report = {
  mode: broadcast ? "BROADCAST_REQUESTED" : "READ_ONLY",
  status: gate.ready ? "READY_AFTER_FRESH_CHECK" : "APPEAL_WINDOW_OPEN",
  network: { chainId: BRADBURY_CHAIN_ID, genesis: BRADBURY_GENESIS, endpoint: NODE_ENDPOINT },
  adjudicator: ADJUDICATOR,
  caseId: CASE_ID,
  policyId: POLICY_ID,
  state: record.state,
  verdict: record.verdict,
  revision: record.revision,
  appealUsed: record.appeal_used,
  decidedAt: record.decided_at,
  earliestFinalizationAt: gate.earliestFinalizationAt,
  earliestFinalizationIso: gate.earliestFinalizationAt == null ? null : new Date(gate.earliestFinalizationAt * 1000).toISOString(),
  reason: gate.reason,
};

if (!broadcast) {
  console.log(json(report));
  process.exit(0);
}
if (!gate.ready) {
  console.log(json(report));
  process.exitCode = 2;
  process.exit();
}

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!privateKey) throw new Error("DEPLOYER_PRIVATE_KEY is required only for the explicit broadcast path");
const account = privateKeyToAccount(privateKey);
const client = createClient({ chain: testnetBradbury, endpoint: NODE_ENDPOINT, account });
const estimate = await client.estimateTransactionFeesForWrite({ address: ADJUDICATOR, functionName: "finalize_case", args: [CASE_ID] });
if (estimate.feeValue <= 0n) throw new Error("Bradbury returned a zero finalize_case fee estimate");
const txHash = String(await client.writeContract({
  address: ADJUDICATOR,
  functionName: "finalize_case",
  args: [CASE_ID],
  fees: {
    distribution: estimate.distribution,
    feeValue: estimate.feeValue,
    ...(estimate.messageAllocations ? { messageAllocations: estimate.messageAllocations } : {}),
  },
}));
const receipt = await client.waitForFinalization({ hash: txHash, fullTransaction: true });
assertExactBradburyReceipt({ receipt, transactionHash: txHash, recipient: ADJUDICATOR, functionName: "finalize_case", args: [CASE_ID] });
record = await readCase();
if (String(record?.state || "").toUpperCase() !== "FINALIZED" || Number(record?.finalized_at) < (gate.earliestFinalizationAt || 0)) {
  throw new Error("finalize_case receipt succeeded without the expected finalized case state");
}
console.log(json({
  ...report,
  status: "FINALIZED_SUCCESSFULLY",
  transactionHash: txHash,
  feeDeposit: estimate.feeValue,
  receipt,
  finalizedAt: record.finalized_at,
  finalVerdict: record.verdict,
  decisionDigest: await readDecisionDigest(),
}));
