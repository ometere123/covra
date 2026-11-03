/** Hosted negative controls. No policies, observations or transactions are fabricated. */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";
const origin = "https://covra-lyart.vercel.app";
const results = [];
async function check(name, path, options, expected) {
  const response = await fetch(origin + path, options);
  await response.arrayBuffer();
  if (!expected.includes(response.status)) throw new Error(name + " returned unexpected HTTP " + response.status);
  results.push({ name, status: response.status }); console.log(name, response.status);
}
await check("indexer unauthenticated", "/api/indexer/sync", { method: "POST" }, [401]);
await check("indexer wrong credential", "/api/indexer/sync", { method: "POST", headers: { authorization: "Bearer invalid-test-token" } }, [401]);
await check("issuer unauthenticated", "/api/evidence-issuer/issue", { method: "POST" }, [401]);
await check("issuer nonexistent public observation", "/api/evidence-issuer/observations/security-check-no-record", {}, [404]);
await check("MCP cross-origin", "/mcp", { method: "POST", headers: { origin: "https://unapproved.example.org" }, body: "{}" }, [403]);
const oversized = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(100001))); controller.close(); } });
await check("MCP streamed size limit", "/mcp", { method: "POST", body: oversized, duplex: "half", headers: { "content-type": "application/json" } }, [413]);
const require = createRequire(import.meta.url);
const globalRoot = execFileSync("npm.cmd", ["root", "-g"], { encoding: "utf8", shell: true }).trim();
const keytar = require(join(globalRoot, "genlayer/node_modules/keytar"));
const admin = await keytar.getPassword("COVRA-testnet-production", "issuer-admin-token");
if (!admin) throw new Error("Protected issuer admin identity unavailable");
for (const sourceUrl of ["http://example.org/source", "https://127.0.0.1/source", "https://192.168.1.1/source", "https://covra-lyart.vercel.app/source"]) {
  await check("issuer unsafe source " + new URL(sourceUrl).hostname, "/api/evidence-issuer/issue", {
    method: "POST", headers: { authorization: "Bearer " + admin, "content-type": "application/json" },
    body: JSON.stringify({ observationId: "security-check-no-record", claimId: "8cfa78d0-7001-4322-899b-2d53993ee5a2", sourceUrl }),
  }, [400]);
}
await check("issuer arbitrary assertions rejected", "/api/evidence-issuer/issue", {
  method: "POST", headers: { authorization: "Bearer " + admin, "content-type": "application/json" },
  body: JSON.stringify({ observationId: "security-check-no-record", claimId: "8cfa78d0-7001-4322-899b-2d53993ee5a2", sourceUrl: "https://example.org/source", facts: { invented: true } }),
}, [422]);
if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const response = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/auth_challenges?select=nonce_digest", { headers: { apikey: anon, authorization: "Bearer " + anon } });
  const body = await response.json();
  if (!(response.status === 401 || response.status === 403 || (response.status === 200 && Array.isArray(body) && body.length === 0))) throw new Error("Anonymous challenge access was not denied");
  results.push({ name: "anonymous nonce table RLS", status: response.status, visibleRows: Array.isArray(body) ? body.length : 0 });
  console.log("Anonymous challenge table RLS verified", response.status);
}
const pool = "0xd8619d3948c08c8364fd3a7a35dc8a65b254a8e4";
const client = createPublicClient({ chain: baseSepolia, transport: http("https://sepolia.base.org") });
if (await client.getChainId() !== 84532) throw new Error("Wrong testnet");
const abi = parseAbi(["function setQuoteSigner(address)", "function scheduleAttestorReplacement(address,address)"]);
for (const control of [
  { name: "unauthorized quote signer change", account: "0x1111111111111111111111111111111111111111", functionName: "setQuoteSigner", args: ["0x2222222222222222222222222222222222222222"] },
  { name: "owner cannot reuse attestor as quote signer", account: "0xa5840e65a15021d8b1648dB10176c04811f07873", functionName: "setQuoteSigner", args: [process.env.ATTESTOR_ADDRESS_1] },
  { name: "owner cannot appoint issuer as attestor", account: "0xa5840e65a15021d8b1648dB10176c04811f07873", functionName: "scheduleAttestorReplacement", args: [process.env.ATTESTOR_ADDRESS_1, "0x2e45D3270eeB6A89e5cD4A9CB55282DFA51d87C5"] },
]) {
  let reverted = false;
  try { await client.simulateContract({ address: pool, abi, account: control.account, functionName: control.functionName, args: control.args }); }
  catch (error) {
    // A transport failure is not a successful negative control.
    reverted = error.name === "ContractFunctionExecutionError" && /revert/i.test(error.shortMessage || "");
  }
  if (!reverted) throw new Error(control.name + " did not produce a verified contract revert");
  results.push({ name: control.name, outcome: "RPC eth_call reverted; no transaction submitted" }); console.log(control.name, "reverted");
}
mkdirSync("docs/deployments", { recursive: true });
writeFileSync("docs/deployments/live-security-controls.json", JSON.stringify({ verifiedAt: new Date().toISOString(), origin, results }, null, 2) + "\n");
