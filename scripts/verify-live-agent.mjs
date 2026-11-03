/** Real hosted authentication/credential lifecycle; never logs cookies or keys. */
import { privateKeyToAccount } from "viem/accounts";
const origin = "https://covra-lyart.vercel.app";
const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const cookies = new Map();
async function call(path, options = {}) {
  const response = await fetch(origin + path, { ...options, headers: {
    "Content-Type": "application/json", Origin: origin,
    Cookie: [...cookies].map(([key, value]) => key + "=" + value).join("; "), ...options.headers,
  } });
  for (const entry of response.headers.getSetCookie()) {
    const [pair] = entry.split(";"); const at = pair.indexOf("=");
    cookies.set(pair.slice(0, at), pair.slice(at + 1));
  }
  const body = await response.json();
  if (!response.ok) throw new Error(path + " failed HTTP " + response.status);
  return body;
}
const challenge = await call("/api/auth/nonce", { method: "POST", body: JSON.stringify({ address: account.address }) });
const nonceCookie = "covra_nonce=" + cookies.get("covra_nonce");
const signature = await account.signMessage({ message: challenge.message });
await call("/api/auth/verify", { method: "POST", body: JSON.stringify({ address: account.address, message: challenge.message, signature }) });
console.log("Hosted wallet authentication verified", account.address);
const replay = await fetch(origin + "/api/auth/verify", { method: "POST", headers: {
  "Content-Type": "application/json", Origin: origin, Cookie: nonceCookie,
}, body: JSON.stringify({ address: account.address, message: challenge.message, signature }) });
const expectedReplay = process.argv.includes("--reproduce-replay") ? 200 : 401;
console.log("Restored-cookie login replay status", replay.status);
if (replay.status !== expectedReplay) throw new Error("Unexpected login replay outcome");
if (!process.argv.includes("--reproduce-replay")) {
  const next = await call("/api/auth/nonce", { method: "POST", body: JSON.stringify({ address: account.address }) });
  const nextCookie = "covra_nonce=" + cookies.get("covra_nonce");
  const nextSignature = await account.signMessage({ message: next.message });
  const race = await Promise.all([0, 1].map(() => fetch(origin + "/api/auth/verify", { method: "POST", headers: {
    "Content-Type": "application/json", Origin: origin, Cookie: nextCookie,
  }, body: JSON.stringify({ address: account.address, message: next.message, signature: nextSignature }) })));
  const statuses = race.map(result => result.status).sort();
  if (String(statuses) !== "200,401") throw new Error("Concurrent authentication replay was accepted");
  console.log("Concurrent nonce consumption verified", statuses.join("/"));
}
const credential = await call("/api/agents", { method: "POST", body: JSON.stringify({ label: "Live verification — read only", scopes: ["policy:read"], expiresInDays: 1, maxDailyRequests: 10 }) });
try {
  // Deliberately omit the owner cookie to exercise agent authorization.
  const response = await fetch(origin + "/api/policies", { headers: { Authorization: "Bearer " + credential.secret } });
  if (response.status !== 200) throw new Error("Agent policy read failed HTTP " + response.status);
  const body = await response.json();
  console.log("Scoped agent policy read", response.status, "items", body.items?.length);
  for (const [name, shouldFail] of [["my_policies", false], ["my_claims", true]]) {
    const mcp = await fetch(origin + "/mcp", { method: "POST", headers: {
      Authorization: "Bearer " + credential.secret, "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } }) });
    const text = await mcp.text();
    const packet = mcp.headers.get("content-type")?.includes("text/event-stream")
      ? JSON.parse(text.split("\n").find(line => line.startsWith("data:"))?.slice(5) || "{}") : JSON.parse(text);
    if (mcp.status !== 200 || packet.error || Boolean(packet.result?.isError) !== shouldFail)
      throw new Error("MCP scope verification failed for " + name + " HTTP " + mcp.status);
    console.log("MCP scope", name, shouldFail ? "rejected correctly" : "authorized");
  }
} finally {
  await call("/api/agents?id=" + credential.agent.id, { method: "DELETE" });
}
const rejected = await fetch(origin + "/api/policies", { headers: { Authorization: "Bearer " + credential.secret } });
if (rejected.status !== 401) throw new Error("Revoked key was not rejected");
console.log("Credential revocation verified", rejected.status);
