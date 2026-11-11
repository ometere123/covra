import { privateKeyToAccount } from "viem/accounts";

const origin = "https://covra-lyart.vercel.app";
const policyId = process.argv[2];
const incidentAt = process.argv[3];
if (!/^0x[0-9a-fA-F]{64}$/.test(policyId || "") || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(incidentAt || "")) {
  throw new Error("Usage: class0-claim-intake.mjs <policyId> <canonical incident timestamp>");
}
const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const cookies = new Map();
async function call(path, options = {}) {
  const response = await fetch(origin + path, { ...options, headers: {
    "Content-Type": "application/json", Origin: origin,
    Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "), ...(options.headers || {}),
  } });
  for (const entry of response.headers.getSetCookie()) {
    const [pair] = entry.split(";"); const at = pair.indexOf("="); cookies.set(pair.slice(0, at), pair.slice(at + 1));
  }
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${body.error || "request failed"}`);
  return body;
}
const nonce = await call("/api/auth/nonce", { method: "POST", body: JSON.stringify({ address: account.address }) });
await call("/api/auth/verify", { method: "POST", body: JSON.stringify({ address: account.address, message: nonce.message, signature: await account.signMessage({ message: nonce.message }) }) });
const result = await call("/api/claims", { method: "POST", headers: { "Idempotency-Key": `class0-${policyId.slice(2, 18)}-pilot-20261111` }, body: JSON.stringify({
  policyId, coverageClass: 0, incidentAt,
  description: "Controlled COVRA testbed task failed to publish its required public deliverable before the signed immutable deadline. This intake is a disclosed testnet protocol exercise; the repository, observer workflow and one-USDC accounting penalty are COVRA-controlled and are not independent commercial evidence.",
  evidenceUrls: [], requestedMicroUsdc: "1000000",
}) });
console.log(JSON.stringify({ owner: account.address, policyId, claim: result.claim, onchainClaimId: result.onchainClaimId, evidenceDigest: result.evidenceDigest, settlementStatus: result.settlementStatus }, null, 2));
