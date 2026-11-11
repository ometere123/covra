import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createPublicClient, createWalletClient, http, sha256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { assertExactBradburyReceipt } from "../src/lib/bradbury-receipt.ts";
import { assertBradburyNodeIdentity, readFinalizedBradburyView } from "../src/lib/bradbury-final-state.ts";
import { poolsAbi } from "../src/lib/chain.ts";

const observerRun = process.argv[2];
if (!/^\d+$/.test(observerRun || "")) throw new Error("Usage: class0-live-runner.mjs <GitHub observer run id>");
if (process.env.COVRA_ENV !== "testnet" || process.env.COVRA_DEPLOY_CONFIRM !== "TESTNET_ONLY") throw new Error("Only COVRA testnet execution is allowed");
const origin = "https://covra-lyart.vercel.app";
const repo = "ometere123/covra";
const policyId = "0x888bc262dc251cda642d6843a3d69e94d403871a88ee8e570c04f6c4be7eafcd";
const owner = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const pool = "0xd8619d3948c08c8364fd3a7a35dc8a65b254a8e4";
const adjudicator = "0xaefc8672272392310a2ea102787e28bb1f34e1d3";
const taskId = "covra-service-failure-pilot-2026-11-11-01";
const taskHash = "0x97ea456fd40203a4ac6424955312ec10aa200ceba0a855bf01022c7d408b0f74";
const termsHash = "0xc2c43b0ff585725587e4aa048e824a979adc16708628ca23f35cb3c4cdce6554";
const riskSpecHash = "0xb59375ff5246954e65a153cac00f4a071d8d86a05f3776835603ba1fd2dad0ae";
const deadlineIso = "2026-11-11T09:25:00.000Z";
const observationFile = `testbed/class0/observations/class0-${taskId}.json`;
const statePath = "docs/deployments/class0-live-lifecycle.json";
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { status: "started", chainId: 84532, pool, adjudicator, policyId, taskId, taskHash, deadlineIso };
const save = (patch) => { Object.assign(state, patch, { updatedAt: new Date().toISOString() }); writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cli = process.platform === "win32" ? (name) => `${name}.cmd` : (name) => name;
function runCli(name, args, input) {
  const result = spawnSync(cli(name), args, { cwd: process.cwd(), input, encoding: "utf8", maxBuffer: 4 * 1024 * 1024, windowsHide: true, shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`${name} failed with exit ${result.status ?? result.error?.code ?? "unknown"}`);
  return result.stdout || "";
}
const json = (value) => JSON.stringify(value, (_, entry) => typeof entry === "bigint" ? entry.toString() : entry);
const canonicalJson = (input) => Array.isArray(input)
  ? `[${input.map(canonicalJson).join(",")}]`
  : input && typeof input === "object"
    ? `{${Object.keys(input).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(input[key])}`).join(",")}}`
    : JSON.stringify(input);
const claimIdFromUuid = (uuid, insured) => sha256(stringToHex(`COVRA-CLAIM:${insured.toLowerCase()}:${uuid.toLowerCase()}`));
const cookies = new Map();
async function hosted(path, options = {}) {
  const response = await fetch(origin + path, { ...options, headers: { "Content-Type": "application/json", Origin: origin, Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "), ...(options.headers || {}) } });
  for (const entry of response.headers.getSetCookie()) { const [pair] = entry.split(";"); const at = pair.indexOf("="); cookies.set(pair.slice(0, at), pair.slice(at + 1)); }
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${body.error || "request failed"}`);
  return body;
}
async function waitForObserver() {
  for (;;) {
    const run = JSON.parse(runCli("gh", ["run", "view", observerRun, "--repo", repo, "--json", "status,conclusion"]));
    if (run.status === "completed") {
      if (run.conclusion !== "success") throw new Error(`Observer workflow ended ${run.conclusion}`);
      return run;
    }
    console.log(`Observer workflow ${run.status}; awaiting the frozen deadline.`);
    await sleep(15_000);
  }
}
async function observationCommit() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const commits = JSON.parse(runCli("gh", ["api", `repos/${repo}/commits?path=${encodeURIComponent(observationFile)}&per_page=5`]));
    if (commits[0]?.sha) return commits[0].sha;
    await sleep(10_000);
  }
  throw new Error("Observer completed but no immutable observation commit was visible");
}
async function configureDemoToken() {
  const listing = runCli("vercel", ["env", "ls", "production"]);
  if (listing.includes("EVIDENCE_ISSUER_DEMO_TOKEN")) {
    if (!state.demoTokenConfigured) throw new Error("EVIDENCE_ISSUER_DEMO_TOKEN already exists; refusing to overwrite an unknown protected value");
    // This is the disposable token generated by a prior interrupted runner.
    // Rotate only that exact pilot variable; the original admin credential and
    // issuer signing identity are never touched.
    runCli("vercel", ["env", "rm", "EVIDENCE_ISSUER_DEMO_TOKEN", "--environment", "production", "--yes"]);
  }
  const token = `cvra_demo_${randomBytes(32).toString("hex")}`;
  // Feed the generated value over stdin. It never appears in a command line,
  // repository file, log line or response body.
  runCli("vercel", ["env", "add", "EVIDENCE_ISSUER_DEMO_TOKEN", "--environment", "production", "--sensitive", "--yes"], `${token}\n`);
  const output = runCli("vercel", ["deploy", "--prod", "--yes"]);
  const deploymentUrl = output.match(/https:\/\/[^\s]+\.vercel\.app/)?.[0] || null;
  // Deliberately do not persist the generated token. It remains only in this
  // process memory and is never printed, committed, or written to a checkpoint.
  save({ demoTokenConfigured: true, deploymentUrl });
  console.log(JSON.stringify({ deploymentUrl, demoTokenConfigured: true }));
  return token;
}
async function createClaim() {
  if (state.claim?.claim?.id) return state.claim;
  const nonce = await hosted("/api/auth/nonce", { method: "POST", body: JSON.stringify({ address: owner.address }) });
  await hosted("/api/auth/verify", { method: "POST", body: JSON.stringify({ address: owner.address, message: nonce.message, signature: await owner.signMessage({ message: nonce.message }) }) });
  const claim = await hosted("/api/claims", { method: "POST", headers: { "Idempotency-Key": `class0-${policyId.slice(2, 18)}-pilot-20261111` }, body: JSON.stringify({
    policyId, coverageClass: 0, incidentAt: deadlineIso,
    description: "Controlled COVRA testbed task failed to publish its required public deliverable before the signed immutable deadline. This intake is a disclosed testnet protocol exercise; the repository, observer workflow and one-USDC accounting value are COVRA-controlled and are not independent commercial evidence.",
    evidenceUrls: [], requestedMicroUsdc: "1000000",
  }) });
  save({ claim });
  return claim;
}
async function issueEvidence(token, claim) {
  if (state.evidence?.evidenceDigest) return state.evidence;
  const commit = await observationCommit();
  const sourceUrl = `https://raw.githubusercontent.com/${repo}/${commit}/${observationFile}`;
  const raw = await fetch(sourceUrl); if (!raw.ok) throw new Error(`Immutable observation URL HTTP ${raw.status}`);
  const source = await raw.json();
  if (source.observation_id !== `class0-${taskId}` || source.event_time !== deadlineIso || source.facts?.missed_deadline !== true) throw new Error("Public observer record does not satisfy the frozen class0 outcome");
  const response = await fetch(`${origin}/api/evidence-issuer/issue`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ observationId: source.observation_id, claimId: claim.claim.id, sourceUrl }) });
  const body = await response.json();
  if (!response.ok) throw new Error(`Hosted issuer HTTP ${response.status}: ${body.error || "issuance failed"}`);
  save({ observationCommit: commit, observationUrl: sourceUrl, evidence: body });
  return body;
}
async function lockBase(claim, evidence) {
  if (state.baseLock?.transactionHash) return state.baseLock;
  const claimId = claim.onchainClaimId;
  const rpc = process.env.BASE_RPC_URL || "https://sepolia.base.org";
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpc, { retryCount: 2 }) });
  const wallet = createWalletClient({ account: owner, chain: baseSepolia, transport: http(rpc, { retryCount: 2 }) });
  const locked = await publicClient.readContract({ address: pool, abi: poolsAbi, functionName: "claimLockOf", args: [policyId] });
  if (locked[0] !== `0x${"0".repeat(64)}`) throw new Error("Base policy is already locked; recover its existing receipt before proceeding");
  const simulation = await publicClient.simulateContract({ address: pool, abi: poolsAbi, functionName: "openClaim", args: [policyId, claimId, evidence.evidenceDigest], account: owner.address });
  const hash = await wallet.writeContract({ ...simulation.request, chain: baseSepolia });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 12 });
  if (receipt.status !== "success") throw new Error(`Base claim lock reverted: ${hash}`);
  const after = await publicClient.readContract({ address: pool, abi: poolsAbi, functionName: "claimLockOf", args: [policyId] });
  if (after[0].toLowerCase() !== claimId.toLowerCase() || after[1].toLowerCase() !== evidence.evidenceDigest.toLowerCase()) throw new Error("Base claim lock readback mismatch");
  const result = { chainId: 84532, transactionHash: hash, blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash, gasUsed: receipt.gasUsed.toString(), claimId, evidenceDigest: evidence.evidenceDigest, lock: { claimId: after[0], evidenceDigest: after[1], openedAt: String(after[2]), revision: Number(after[3]), rosterVersion: String(after[4]) } };
  save({ baseLock: result });
  return result;
}
async function bradburyWrite(gen, key, functionName, args) {
  if (state[key]?.transactionHash && state[key]?.executionResult === "FinishedWithReturn") return state[key];
  let txHash = state[key]?.transactionHash;
  let feeDeposit = state[key]?.feeDeposit;
  if (!txHash) {
    const estimate = await gen.estimateTransactionFeesForWrite({ address: adjudicator, functionName, args });
    if (estimate.feeValue <= 0n) throw new Error(`Bradbury returned a zero fee for ${functionName}`);
    feeDeposit = estimate.feeValue.toString();
    txHash = String(await gen.writeContract({ address: adjudicator, functionName, args, fees: { distribution: estimate.distribution, feeValue: estimate.feeValue, ...(estimate.messageAllocations ? { messageAllocations: estimate.messageAllocations } : {}) } }));
    save({ [key]: { transactionHash: txHash, feeDeposit, status: "submitted", functionName } });
  }
  const receipt = await gen.waitForFinalization({ hash: txHash, fullTransaction: true });
  assertExactBradburyReceipt({ receipt, transactionHash: txHash, recipient: adjudicator, functionName, args });
  const result = { transactionHash: txHash, feeDeposit, status: String(receipt.statusName ?? receipt.status), executionResult: String(receipt.txExecutionResultName ?? receipt.txExecutionResult), functionName, receipt: JSON.parse(json(receipt)) };
  save({ [key]: result });
  return result;
}
async function readCase(caseId) {
  const raw = await readFinalizedBradburyView("https://rpc-bradbury.genlayer.com", adjudicator, "get_case", [caseId]);
  const value = raw instanceof Map ? raw.get("") ?? raw.get("result") ?? raw : raw;
  return typeof value === "string" ? JSON.parse(value) : value;
}
async function submitAndAdjudicate(claim, evidence) {
  await assertBradburyNodeIdentity("https://rpc-bradbury.genlayer.com");
  const gen = createClient({ chain: testnetBradbury, endpoint: "https://rpc-bradbury.genlayer.com", account: owner });
  const caseId = claim.onchainClaimId;
  const riskSpec = { coverageClass: 0, subject: taskId, referenceHash: taskHash, statement: "A signed public testnet task must deliver its immutable JSON artifact before the frozen UTC deadline; a one-USDC testnet accounting penalty is recorded only if it is absent.", evidenceIssuerHost: "covra-lyart.vercel.app" };
  const commonArgs = [caseId, policyId, caseId, owner.address, claim.claim.id, 0, termsHash, canonicalJson(riskSpec), riskSpecHash, evidence.publicUrl, evidence.evidenceDigest, deadlineIso, 100];
  if (!state.bradburySubmit?.transactionHash || state.bradburySubmit.executionResult !== "FinishedWithReturn") await bradburyWrite(gen, "bradburySubmit", "submit_case", commonArgs);
  if (!state.bradburyCase) save({ bradburyCase: await readCase(caseId) });
  if (!state.bradburyAdjudicate?.transactionHash || state.bradburyAdjudicate.executionResult !== "FinishedWithReturn") await bradburyWrite(gen, "bradburyAdjudicate", "adjudicate", [caseId]);
  const decided = await readCase(caseId);
  save({ bradburyCase: decided, status: "ADJUDICATED_WAITING_APPEAL_WINDOW", earliestFinalizationAt: new Date((Number(decided.decided_at) + 259200) * 1000).toISOString() });
  return decided;
}

const token = await configureDemoToken();
if (!state.observerCompleted) { await waitForObserver(); save({ observerCompleted: true }); }
const claim = await createClaim();
const evidence = await issueEvidence(token, claim);
const lock = await lockBase(claim, evidence);
const syncSecret = process.env.INDEXER_CRON_SECRET;
if (syncSecret) { const sync = await fetch(`${origin}/api/indexer/sync`, { method: "POST", headers: { Authorization: `Bearer ${syncSecret}`, "Content-Type": "application/json" }, body: JSON.stringify({ maxBlocks: 2000 }) }); save({ indexerAfterLock: { status: sync.status, body: await sync.json() } }); }
const decision = await submitAndAdjudicate(claim, evidence);
console.log(JSON.stringify({ status: state.status, claimId: claim.claim.id, onchainClaimId: claim.onchainClaimId, observationUrl: state.observationUrl, evidenceDigest: evidence.evidenceDigest, baseLock: lock, bradburySubmit: state.bradburySubmit, bradburyAdjudicate: state.bradburyAdjudicate, decision, earliestFinalizationAt: state.earliestFinalizationAt, operatorIndependence: "NOT_VERIFIED", statePath }, null, 2));
