/**
 * Persist the already-finalized class-0 pilot receipts through the production
 * chain-proof API. This script never submits a chain transaction; it only
 * authenticates the configured insured wallet and asks the API to re-read the
 * exact receipts and finalized Bradbury case before updating Supabase.
 */
import { readFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";

if (process.env.COVRA_ENV !== "testnet" || process.env.COVRA_DEPLOY_CONFIRM !== "TESTNET_ONLY") {
  throw new Error("Only COVRA testnet reconciliation is allowed");
}

const state = JSON.parse(readFileSync("docs/deployments/class0-live-lifecycle.json", "utf8"));
const owner = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const origin = "https://covra-lyart.vercel.app";
const cookies = new Map();

async function call(path, options = {}) {
  const response = await fetch(origin + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
      ...(options.headers || {}),
    },
  });
  for (const entry of response.headers.getSetCookie()) {
    const [pair] = entry.split(";");
    const at = pair.indexOf("=");
    cookies.set(pair.slice(0, at), pair.slice(at + 1));
  }
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${body.error || "request failed"}`);
  return body;
}

const nonce = await call("/api/auth/nonce", { method: "POST", body: JSON.stringify({ address: owner.address }) });
await call("/api/auth/verify", {
  method: "POST",
  body: JSON.stringify({ address: owner.address, message: nonce.message, signature: await owner.signMessage({ message: nonce.message }) }),
});

const claimId = state.claim.claim.id;
const steps = [
  ["BASE_LOCKED", state.baseLock.transactionHash, { evidenceDigest: state.evidence.evidenceDigest }],
  ["BRADBURY_SUBMITTED", state.bradburySubmit.transactionHash, {}],
  ["BRADBURY_DECIDED", state.bradburyAdjudicate.transactionHash, {}],
];
const verified = [];
for (const [phase, txHash, extra] of steps) {
  verified.push(await call("/api/claims/chain-proof", {
    method: "POST",
    body: JSON.stringify({ claimId, txHash, phase, ...extra }),
  }));
}

const claimView = await call("/api/claims", { method: "GET" });
let sync = null;
if (process.env.INDEXER_CRON_SECRET) {
  const response = await fetch(`${origin}/api/indexer/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.INDEXER_CRON_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ maxBlocks: 2000 }),
  });
  sync = { status: response.status, body: await response.json() };
}

console.log(JSON.stringify({
  claimId,
  owner: owner.address,
  phases: verified,
  claimView: claimView.items?.filter((item) => item.id === claimId).map((item) => ({
    id: item.id,
    status: item.status,
    baseLockTxHash: item.base_lock_tx_hash,
    bradburyTxHash: item.bradbury_tx_hash,
    bradburyDecisionTxHash: item.bradbury_decision_tx_hash,
    evidenceDigest: item.evidence_manifest_hash,
  })),
  indexer: sync,
  settlement: "NOT_AUTHORIZED_INSUFFICIENT_EVIDENCE",
}, null, 2));
