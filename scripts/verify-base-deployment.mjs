/** Independently verify a recorded Base testnet deployment; optionally retire an empty predecessor. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
const path = process.argv[2];
const record = JSON.parse(readFileSync(path, "utf8"));
const client = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_RPC_URL || "https://sepolia.base.org") });
if (await client.getChainId() !== 84532 || record.chainId !== 84532) throw new Error("Wrong network");
const receipt = await client.getTransactionReceipt({ hash: record.transactionHash });
if (receipt.status !== "success" || receipt.contractAddress?.toLowerCase() !== record.contractAddress.toLowerCase() ||
    String(receipt.blockNumber) !== record.blockNumber) throw new Error("Deployment receipt mismatch");
const abi = parseAbi([
  "function owner() view returns(address)", "function quoteSigner() view returns(address)",
  "function deploymentAuthority() view returns(address)", "function evidenceIssuer() view returns(address)",
  "function bradburyAdjudicator() view returns(address)", "function usdc() view returns(address)",
  "function attestorCount() view returns(uint8)", "function attestor(address) view returns(bool)",
  "function pool(uint8) view returns((uint128 assets,uint128 reserved,uint128 premiumsWritten,uint128 paid,uint256 totalShares))",
  "function paused() view returns(bool)", "function setPaused(bool)",
]);
const address = record.contractAddress;
for (const [fn, expected] of Object.entries({ owner: record.owner, deploymentAuthority: record.owner,
  quoteSigner: record.quoteSigner, evidenceIssuer: record.evidenceIssuer, bradburyAdjudicator: record.adjudicator, usdc: record.usdc })) {
  const value = await client.readContract({ address, abi, functionName: fn });
  if (value.toLowerCase() !== expected.toLowerCase()) throw new Error("Configured role mismatch: " + fn);
}
if (await client.readContract({ address, abi, functionName: "attestorCount" }) !== 5) throw new Error("Incorrect roster size");
for (const signer of record.attestors) if (!await client.readContract({ address, abi, functionName: "attestor", args: [signer] })) throw new Error("Unauthorized configured attestor");
const code = await client.getBytecode({ address });
if (!code || code === "0x") throw new Error("Missing runtime code");
const pools = [];
for (let i = 0; i < 5; i++) pools.push(await client.readContract({ address, abi, functionName: "pool", args: [i] }));
const verified = { ...record, verifiedAt: new Date().toISOString(),
  runtimeCodeSha256: createHash("sha256").update(Buffer.from(code.slice(2), "hex")).digest("hex"), pools };
const old = process.argv[3];
if (old) {
  if (process.env.COVRA_ENV !== "testnet" || process.env.COVRA_DEPLOY_CONFIRM !== "TESTNET_ONLY") throw new Error("Testnet authorization absent");
  const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
  if (account.address.toLowerCase() !== record.owner.toLowerCase()) throw new Error("Wrong owner");
  for (let i = 0; i < 5; i++) {
    const p = await client.readContract({ address: old, abi, functionName: "pool", args: [i] });
    if (Object.values(p).some(value => value !== 0n)) throw new Error("Predecessor has financial activity: manual migration required");
  }
  if (!await client.readContract({ address: old, abi, functionName: "paused" })) {
    const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(process.env.BASE_RPC_URL || "https://sepolia.base.org") });
    const simulation = await client.simulateContract({ address: old, abi, functionName: "setPaused", args: [true], account });
    const hash = await wallet.writeContract(simulation.request);
    // Preserve the hash even if confirmation polling is interrupted.
    verified.supersededPool = { address: old, pauseTransaction: hash, status: "submitted" };
    writeFileSync(path, JSON.stringify(verified, (_, value) => typeof value === "bigint" ? String(value) : value, 2) + "\n");
    const pauseReceipt = await client.waitForTransactionReceipt({ hash, confirmations: 2 });
    if (pauseReceipt.status !== "success" || !await client.readContract({ address: old, abi, functionName: "paused" })) throw new Error("Predecessor pause failed");
    verified.supersededPool = { address: old, pauseTransaction: hash, status: "success", blockNumber: String(pauseReceipt.blockNumber) };
  }
}
writeFileSync(path, JSON.stringify(verified, (_, value) => typeof value === "bigint" ? String(value) : value, 2) + "\n");
console.log("Verified Base Sepolia receipt, runtime code, distinct roles, five authorized attestors and five pools:", address);
if (verified.supersededPool) console.log("Empty predecessor paused:", JSON.stringify(verified.supersededPool));
