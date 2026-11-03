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
const signature = await account.signMessage({ message: challenge.message });
await call("/api/auth/verify", { method: "POST", body: JSON.stringify({ address: account.address, message: challenge.message, signature }) });
console.log("Hosted wallet authentication verified", account.address);
const credential = await call("/api/agents", { method: "POST", body: JSON.stringify({ label: "Live verification — read only", scopes: ["policy:read"], expiresInDays: 1, maxDailyRequests: 10 }) });
try {
  // Deliberately omit the owner cookie to exercise agent authorization.
  const response = await fetch(origin + "/api/policies", { headers: { Authorization: "Bearer " + credential.secret } });
  if (response.status !== 200) throw new Error("Agent policy read failed HTTP " + response.status);
  const body = await response.json();
  console.log("Scoped agent policy read", response.status, "items", body.items?.length);
} finally {
  await call("/api/agents?id=" + credential.agent.id, { method: "DELETE" });
}
const rejected = await fetch(origin + "/api/policies", { headers: { Authorization: "Bearer " + credential.secret } });
if (rejected.status !== 401) throw new Error("Revoked key was not rejected");
console.log("Credential revocation verified", rejected.status);
