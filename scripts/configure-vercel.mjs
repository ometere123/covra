/** Authorized production provisioning. Secret values travel only over stdin. */
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const require = createRequire(import.meta.url);
const globalRoot = execFileSync("npm.cmd", ["root", "-g"], { encoding: "utf8", shell: true }).trim();
const keytar = require(join(globalRoot, "genlayer/node_modules/keytar"));
const cli = join(globalRoot, "vercel/dist/vc.js");
const service = "COVRA-testnet-production";
let key = await keytar.getPassword(service, "evidence-issuer");
if (!key) {
  key = generatePrivateKey();
  await keytar.setPassword(service, "evidence-issuer", key);
}
const wallet = privateKeyToAccount(key).address;
const identities = [process.env.DEPLOYER_PRIVATE_KEY, process.env.QUOTE_SIGNER_PRIVATE_KEY]
  .filter(Boolean).map(value => privateKeyToAccount(value).address.toLowerCase());
for (let i = 1; i <= 5; i++) if (process.env[`ATTESTOR_ADDRESS_${i}`]) identities.push(process.env[`ATTESTOR_ADDRESS_${i}`].toLowerCase());
if (identities.includes(wallet.toLowerCase())) throw new Error("Issuer identity overlaps another configured role");
const publicValues = {
  COVRA_ENV: "testnet", NEXT_PUBLIC_APP_URL: "https://covra-lyart.vercel.app",
  BRADBURY_CHAIN_ID: "4221", BRADBURY_CHAIN_RPC_URL: "https://rpc.testnet-chain.genlayer.com",
  BRADBURY_NODE_RPC_URL: "https://rpc-bradbury.genlayer.com",
  NEXT_PUBLIC_BRADBURY_NODE_RPC_URL: "https://rpc-bradbury.genlayer.com",
  BASE_CHAIN_ID: "84532", BASE_RPC_URL: "https://sepolia.base.org", NEXT_PUBLIC_BASE_RPC_URL: "https://sepolia.base.org",
  NEXT_PUBLIC_BASE_USDC_ADDRESS: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  EVIDENCE_ISSUER_HOST: "covra-lyart.vercel.app", EVIDENCE_ISSUER_WALLET: wallet,
  ATTESTOR_EVIDENCE_HOSTS: "covra-lyart.vercel.app", COVRA_APPROVED_ISSUER_HOSTS: "covra-lyart.vercel.app",
  ATTESTOR_ISSUER_WALLETS: JSON.stringify({ "covra-lyart.vercel.app": wallet }),
};
const secretValues = { EVIDENCE_ISSUER_PRIVATE_KEY: key };
let admin = await keytar.getPassword(service, "issuer-admin-token");
if (!admin) { admin = randomBytes(48).toString("hex"); await keytar.setPassword(service, "issuer-admin-token", admin); }
secretValues.EVIDENCE_ISSUER_ADMIN_TOKEN = admin;
for (const name of ["AUTH_SECRET", "AGENT_API_KEY_PEPPER", "INDEXER_CRON_SECRET", "QUOTE_SIGNER_PRIVATE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (process.env[name]) secretValues[name] = process.env[name];
}
for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_EVIDENCE_BUCKET"]) {
  if (process.env[name]) publicValues[name] = process.env[name];
}
for (const [type, values] of [["config", publicValues], ["secret", secretValues]]) {
  for (const [name, value] of Object.entries(values)) {
    const result = spawnSync(process.execPath, [cli, "env", "add", name, "--environment", "production", "--type", type, "--force", "--yes"], { input: value, encoding: "utf8", timeout: 60000 });
    console.log(name, result.status === 0 ? "configured" : "FAILED");
    if (result.status !== 0) process.exitCode = 1;
  }
}
console.log("Issuer public wallet:", wallet);
console.log("Recovery: Windows Credential Manager service", service, "account evidence-issuer");
