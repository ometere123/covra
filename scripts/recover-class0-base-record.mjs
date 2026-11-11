import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, http, parseAbi, parseEventLogs } from "viem";
import { baseSepolia } from "viem/chains";

const outputPath = "docs/deployments/class0-base-funding-purchase-2026-11-11.json";
if (existsSync(outputPath)) throw new Error(`Record already exists: ${outputPath}`);
const pool = "0xd8619d3948c08c8364fd3a7a35dc8a65b254a8e4";
const usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const owner = "0xa5840e65a15021d8b1648dB10176c04811f07873";
const policyId = "0x888bc262dc251cda642d6843a3d69e94d403871a88ee8e570c04f6c4be7eafcd";
const quoteRecord = JSON.parse(readFileSync("docs/deployments/class0-quote-2026-11-11.json", "utf8"));
const rpc = process.env.BASE_RPC_URL || "https://sepolia.base.org";
const client = createPublicClient({ chain: baseSepolia, transport: http(rpc, { retryCount: 2 }) });
const poolAbi = parseAbi([
  "event CapitalDeposited(uint8 indexed coverageClass,address indexed underwriter,uint256 usdcAmount,uint256 shares)",
  "event PolicyPurchased(bytes32 indexed policyId,address indexed insured,address indexed beneficiary,uint8 coverageClass,uint96 premium,uint96 limit,uint64 startsAt,uint64 endsAt,uint64 claimDeadline,bytes32 termsHash,bytes32 riskSpecHash)",
  "function pool(uint8) view returns (uint128 assets,uint128 reserved,uint128 premiumsWritten,uint128 paid,uint256 totalShares)",
  "function policies(bytes32) view returns (address insured,address beneficiary,uint8 coverageClass,uint8 state,uint96 limit,uint64 startsAt,uint64 endsAt,uint64 claimDeadline,bytes32 termsHash,bytes32 riskSpecHash)",
  "function sharesOf(uint8,address) view returns (uint256)",
]);
const usdcAbi = parseAbi([
  "event Approval(address indexed owner,address indexed spender,uint256 value)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "function balanceOf(address) view returns (uint256)",
]);
const hashes = {
  fundingApproval: "0x8d210aa7e7c0d57f09f8e66621b25490b0db24bcfcc57406d9cf3403ccf092e0",
  deposit: "0x2e92c6def763b884f19a04234b77974ebf831be202291e9d416690f7fb7011c7",
  purchaseApproval: "0xe2f53b51e741d02700f0075b609ad8863f3f9c01442c7869699fa7f614c83921",
  purchase: "0xd67322063ddf6f261a1a820c23371c058b53dcbf2d9e50b7e742e5088a007e4f",
};
const receipt = async (hash) => {
  const value = await client.getTransactionReceipt({ hash });
  if (value.status !== "success") throw new Error(`Receipt is not successful: ${hash}`);
  return { hash, status: value.status, blockNumber: value.blockNumber.toString(), blockHash: value.blockHash, gasUsed: value.gasUsed.toString(), effectiveGasPrice: value.effectiveGasPrice?.toString() ?? null, transactionIndex: value.transactionIndex };
};
const receipts = {};
for (const [key, hash] of Object.entries(hashes)) receipts[key] = await receipt(hash);
const decoded = parseEventLogs({ abi: poolAbi, logs: (await client.getTransactionReceipt({ hash: hashes.deposit })).logs, strict: false });
const decodedPurchase = parseEventLogs({ abi: poolAbi, logs: (await client.getTransactionReceipt({ hash: hashes.purchase })).logs, strict: false });
if (!decoded.some((x) => x.eventName === "CapitalDeposited") || !decodedPurchase.some((x) => x.eventName === "PolicyPurchased")) throw new Error("Required pool lifecycle events were not found in the receipts");
const [balance, poolState, shares, policy, head] = await Promise.all([
  client.readContract({ address: usdc, abi: usdcAbi, functionName: "balanceOf", args: [owner] }),
  client.readContract({ address: pool, abi: poolAbi, functionName: "pool", args: [0] }),
  client.readContract({ address: pool, abi: poolAbi, functionName: "sharesOf", args: [0, owner] }),
  client.readContract({ address: pool, abi: poolAbi, functionName: "policies", args: [policyId] }),
  client.getBlockNumber(),
]);
const state = { assets: String(poolState[0]), reserved: String(poolState[1]), premiumsWritten: String(poolState[2]), paid: String(poolState[3]), totalShares: String(poolState[4]) };
const policySnapshot = { insured: policy[0], beneficiary: policy[1], coverageClass: Number(policy[2]), state: Number(policy[3]), limit: String(policy[4]), startsAt: String(policy[5]), endsAt: String(policy[6]), claimDeadline: String(policy[7]), termsHash: policy[8], riskSpecHash: policy[9] };
const record = {
  chainId: 84532, pool, usdc, owner, coverageClass: 0, policyId, quote: quoteRecord,
  allocation: { depositMicroUsdc: "99000000", premiumMicroUsdc: "1000000", requiredMicroUsdc: "100000000" },
  receipts, postflight: { block: head.toString(), usdcBalanceMicro: balance.toString(), pool: state, shares: shares.toString(), policy: policySnapshot, assertions: { policyStateActive: Number(policy[3]) === 1, premiumEnteredPool: state.premiumsWritten === "1000000", reserveMatchesLimit: state.reserved === "100000000", walletBalanceAfterPurchase: balance.toString() === "5000000" } },
  status: "confirmed_recovered_after_local_recording_failure",
  note: "Approval, deposit and purchase receipts were recovered from Base Sepolia after the first recorder failed while serializing a viem tuple. No transaction was resubmitted.",
};
writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: record.status, receipts, postflight: record.postflight, outputPath }, null, 2));
