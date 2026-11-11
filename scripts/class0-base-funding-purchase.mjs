import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { baseClient, poolsAbi, quoteToAbi, usdcAbi } from "../src/lib/chain.ts";

if (process.env.COVRA_ENV !== "testnet" || process.env.COVRA_DEPLOY_CONFIRM !== "TESTNET_ONLY") {
  throw new Error("Refusing lifecycle transaction: only COVRA testnet mode is allowed");
}
const pool = "0xd8619d3948c08c8364fd3a7a35dc8a65b254a8e4";
const usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const quoteRecordPath = "docs/deployments/class0-quote-2026-11-11.json";
const outputPath = "docs/deployments/class0-base-funding-purchase-2026-11-11.json";
if (existsSync(outputPath)) throw new Error(`Refusing to repeat an existing lifecycle record: ${outputPath}`);
const quoteRecord = JSON.parse(readFileSync(quoteRecordPath, "utf8"));
const quote = quoteToAbi(quoteRecord.quote);
const signature = quoteRecord.signature;
const poolSnapshot = (value) => ({ assets: String(value[0]), reserved: String(value[1]), premiumsWritten: String(value[2]), paid: String(value[3]), totalShares: String(value[4]) });
const policySnapshot = (value) => ({ insured: value[0], beneficiary: value[1], coverageClass: Number(value[2]), state: Number(value[3]), limit: String(value[4]), startsAt: String(value[5]), endsAt: String(value[6]), claimDeadline: String(value[7]), termsHash: value[8], riskSpecHash: value[9] });
const owner = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const rpc = process.env.BASE_RPC_URL || "https://sepolia.base.org";
const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpc, { retryCount: 2 }) });
const wallet = createWalletClient({ account: owner, chain: baseSepolia, transport: http(rpc, { retryCount: 2 }) });
if (await publicClient.getChainId() !== 84532) throw new Error("Settlement RPC is not Base Sepolia");
const blockBefore = await publicClient.getBlockNumber();
const [ethBalance, usdcBalance, poolBefore, allowanceBefore] = await Promise.all([
  publicClient.getBalance({ address: owner.address }),
  publicClient.readContract({ address: usdc, abi: usdcAbi, functionName: "balanceOf", args: [owner.address] }),
  publicClient.readContract({ address: pool, abi: poolsAbi, functionName: "pool", args: [0] }),
  publicClient.readContract({ address: usdc, abi: usdcAbi, functionName: "allowance", args: [owner.address, pool] }),
]);
const depositAmount = 99_000_000n;
const requiredBalance = depositAmount + quote.premium;
if (usdcBalance < requiredBalance) throw new Error(`Insufficient USDC: need ${requiredBalance}, observed ${usdcBalance}`);
if (BigInt(Math.floor(Date.now() / 1000)) > quote.quoteDeadline) throw new Error("The hosted quote expired before the transaction sequence began");
const record = {
  chainId: 84532,
  pool,
  usdc,
  owner: owner.address,
  coverageClass: 0,
  policyId: quote.policyId,
  quote: quoteRecord,
  allocation: { depositMicroUsdc: depositAmount.toString(), premiumMicroUsdc: quote.premium.toString(), requiredMicroUsdc: requiredBalance.toString() },
  preflight: { block: blockBefore.toString(), ethBalanceWei: ethBalance.toString(), usdcBalanceMicro: usdcBalance.toString(), allowanceMicro: allowanceBefore.toString(), pool: poolSnapshot(poolBefore) },
  status: "submitted",
};
const wait = async (hash) => {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
  return { hash, status: receipt.status, blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash, gasUsed: receipt.gasUsed.toString(), effectiveGasPrice: receipt.effectiveGasPrice?.toString() ?? null, transactionIndex: receipt.transactionIndex };
};
if (allowanceBefore < depositAmount) {
  const approvalHash = await wallet.writeContract({ address: usdc, abi: usdcAbi, functionName: "approve", args: [pool, depositAmount], account: owner, chain: baseSepolia });
  record.approval = await wait(approvalHash);
}
const depositHash = await wallet.writeContract({ address: pool, abi: poolsAbi, functionName: "deposit", args: [0, depositAmount], account: owner, chain: baseSepolia });
record.deposit = await wait(depositHash);
const allowanceAfterDeposit = await publicClient.readContract({ address: usdc, abi: usdcAbi, functionName: "allowance", args: [owner.address, pool] });
if (allowanceAfterDeposit < quote.premium) {
  const purchaseApprovalHash = await wallet.writeContract({ address: usdc, abi: usdcAbi, functionName: "approve", args: [pool, quote.premium], account: owner, chain: baseSepolia });
  record.purchaseApproval = await wait(purchaseApprovalHash);
}
await publicClient.simulateContract({ address: pool, abi: poolsAbi, functionName: "purchase", args: [quote, signature], account: owner.address });
const purchaseHash = await wallet.writeContract({ address: pool, abi: poolsAbi, functionName: "purchase", args: [quote, signature], account: owner, chain: baseSepolia });
record.purchase = await wait(purchaseHash);
const [blockAfter, usdcBalanceAfter, poolAfter, policy] = await Promise.all([
  publicClient.getBlockNumber(),
  publicClient.readContract({ address: usdc, abi: usdcAbi, functionName: "balanceOf", args: [owner.address] }),
  publicClient.readContract({ address: pool, abi: poolsAbi, functionName: "pool", args: [0] }),
  publicClient.readContract({ address: pool, abi: poolsAbi, functionName: "policies", args: [quote.policyId] }),
]);
record.postflight = {
  block: blockAfter.toString(),
  usdcBalanceMicro: usdcBalanceAfter.toString(),
  pool: poolSnapshot(poolAfter),
  policy: policySnapshot(policy),
  assertions: {
    policyStateActive: Number(policy[3]) === 1,
    premiumEnteredPool: BigInt(poolAfter[2]) >= BigInt(poolBefore[2]) + quote.premium,
    reserveMatchesLimit: BigInt(poolAfter[1]) >= quote.limit,
    walletDeltaMicro: (usdcBalance - usdcBalanceAfter).toString(),
  },
};
record.status = "confirmed";
writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: record.status, owner: owner.address, policyId: quote.policyId, approval: record.approval?.hash ?? null, deposit: record.deposit, purchaseApproval: record.purchaseApproval?.hash ?? null, purchase: record.purchase, assertions: record.postflight.assertions, outputPath }, null, 2));
