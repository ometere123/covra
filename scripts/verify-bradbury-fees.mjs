/** Verify mined refund/settlement events rather than infer refunds from a fee quote. */
import { createPublicClient, http, parseAbi, decodeEventLog } from "viem";
import { testnetBradbury } from "genlayer-js/chains";
import { mkdirSync, writeFileSync } from "node:fs";
const rpc = "https://rpc.testnet-chain.genlayer.com";
const client = createPublicClient({ transport: http(rpc, { retryCount: 2, timeout: 15000 }) });
if (await client.getChainId() !== 4221 || (await client.getBlock({ blockNumber: 0n })).hash !==
    "0x17d89764d4f4f963158fc4c5e8f2cb670c2837740b35f37081c12860c3df97e4") throw new Error("Wrong Bradbury Phase 2 chain");
const manager = "0x3F71AE080BD6270A91dBcc7960d88797828538E0";
const resolved = await client.readContract({ address: manager, abi: parseAbi(["function getAddressNonZero(string) view returns(address)"]), functionName: "getAddressNonZero", args: ["FeeManager"] });
if (resolved.toLowerCase() !== testnetBradbury.feeManagerContract.address.toLowerCase()) throw new Error("SDK FeeManager differs from deployed AddressManager");
const txId = process.argv[2];
if (!/^0x[0-9a-fA-F]{64}$/.test(txId || "")) throw new Error("Provide the existing GenLayer transaction ID");
const response = await fetch("https://rpc-bradbury.genlayer.com", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "gen_getTransactionReceipt", params: [{ txId }] }), signal: AbortSignal.timeout(15000) });
const packet = await response.json();
if (packet.error) throw new Error(JSON.stringify(packet.error));
const receipt = packet.result;
if (receipt.id.toLowerCase() !== txId.toLowerCase() || receipt.statusName !== "Finalized" || receipt.txExecutionResultName !== "FinishedWithReturn") throw new Error("Not a successful finalized transaction");
const start = BigInt(receipt.readStateBlockRanges[0].ActivationBlock);
const head = await client.getBlockNumber();
const event = testnetBradbury.consensusMainContract.abi.find(item => item.type === "event" && item.name === "FeesRefunded");
const refunds = [];
for (let fromBlock = start; fromBlock <= head; fromBlock += 2000n) {
  const toBlock = fromBlock + 1999n > head ? head : fromBlock + 1999n;
  refunds.push(...await client.getLogs({ address: [testnetBradbury.consensusMainContract.address, resolved], event, args: { txId }, fromBlock, toBlock, strict: true }));
  if (refunds.length) break;
}
if (!refunds.length) throw new Error("No mined FeesRefunded event found; actual refund remains unverified");
const settlements = [];
for (const refund of refunds) {
  const mined = await client.getTransactionReceipt({ hash: refund.transactionHash });
  if (mined.status !== "success") throw new Error("Refund transaction reverted");
  const events = [];
  for (const log of mined.logs) {
    if (![testnetBradbury.consensusMainContract.address.toLowerCase(), resolved.toLowerCase()].includes(log.address.toLowerCase())) continue;
    try {
      const decoded = decodeEventLog({ abi: testnetBradbury.consensusMainContract.abi, data: log.data, topics: log.topics });
      if (decoded.args.txId?.toLowerCase() === txId.toLowerCase()) events.push({ event: decoded.eventName, args: decoded.args, logIndex: log.logIndex });
    } catch { /* unrelated ABI event */ }
  }
  settlements.push({ evmTransactionHash: mined.transactionHash, blockNumber: mined.blockNumber, blockHash: mined.blockHash, refund: refund.args, events });
}
const record = { chainId: 4221, verifiedAt: new Date().toISOString(), txId, recipient: receipt.recipient,
  status: receipt.statusName, executionResult: receipt.txExecutionResultName, feeManager: resolved, fees: receipt.fees, settlements };
mkdirSync("docs/deployments", { recursive: true });
writeFileSync(`docs/deployments/bradbury-fees-${txId}.json`, JSON.stringify(record, (_, value) => typeof value === "bigint" ? String(value) : value, 2) + "\n");
console.log(JSON.stringify(record, (_, value) => typeof value === "bigint" ? String(value) : value));
