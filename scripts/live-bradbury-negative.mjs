/** One deliberate unauthorized write; persist its hash before polling. Never create a case. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient, abi as calldataAbi } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, hexToBytes } from "viem";
const path = "docs/deployments/bradbury-unauthorized-host.json";
const address = "0xaefc8672272392310a2ea102787e28bb1f34e1d3";
const evm = createPublicClient({ transport: http("https://rpc.testnet-chain.genlayer.com") });
if (await evm.getChainId() !== 4221 || (await evm.getBlock({ blockNumber: 0n })).hash !==
  "0x17d89764d4f4f963158fc4c5e8f2cb670c2837740b35f37081c12860c3df97e4") throw new Error("Wrong Phase 2 network");
let record;
if (existsSync(path)) record = JSON.parse(readFileSync(path, "utf8"));
else {
  if (!process.argv.includes("--submit") || process.env.COVRA_ENV !== "testnet" || process.env.COVRA_DEPLOY_CONFIRM !== "TESTNET_ONLY") throw new Error("Explicit testnet negative-control submission required");
  const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
  if (account.address.toLowerCase() !== "0xa5840e65a15021d8b1648db10176c04811f07873") throw new Error("Unexpected test wallet");
  const client = createClient({ chain: testnetBradbury, endpoint: "https://rpc-bradbury.genlayer.com", account });
  const args = ["unauthorized.example.org", true];
  let estimate;
  // SDK simulation rejects this known-invalid write before charging protocol
  // fees. Decode the real VM error exactly; do not broadcast around that gate.
  const originalError = console.error;
  try {
    console.error = () => {}; // The SDK otherwise prints an entire public VM trace.
    estimate = await client.estimateTransactionFeesForWrite({ address, functionName: "allow_evidence_host", args });
  } catch (error) {
    let cursor = error, decoded;
    const diagnostics = [];
    for (let depth = 0; cursor && depth < 8; depth++, cursor = cursor.cause || cursor.error) {
      diagnostics.push({ code: cursor.code, dataType: typeof cursor.data, fields: Object.keys(cursor) });
      if (typeof cursor.data === "string" && /^(?:0x)?[0-9a-f]+$/i.test(cursor.data)) {
        decoded = calldataAbi.calldata.decode(hexToBytes(cursor.data.startsWith("0x") ? cursor.data : "0x" + cursor.data));
        break;
      }
    }
    const field = key => decoded instanceof Map ? decoded.get(key) : decoded?.[key];
    if (field("kind") !== "UserError" || field("data") !== "[EXPECTED] only owner") {
      originalError("Unexpected diagnostic structure", JSON.stringify(diagnostics));
      throw new Error("Negative-control simulation failed without the expected decoded authorization error");
    }
    record = { chainId: 4221, caller: account.address, adjudicator: address, method: "allow_evidence_host", args,
      status: "REJECTED_BEFORE_BROADCAST", executionKind: field("kind"), diagnostic: field("data"),
      checkedAt: new Date().toISOString(), transactionSubmitted: false, diagnostics };
    writeFileSync(path, JSON.stringify(record, null, 2) + "\n");
    console.log("Live target VM rejected unauthorized host mutation before broadcast", record.diagnostic);
    process.exit(0);
  } finally { console.error = originalError; }
  if (estimate.feeValue <= 0n || await evm.getBalance({ address: account.address }) <= estimate.feeValue) throw new Error("Nonzero protocol fee and gas funds required");
  const hash = await client.writeContract({ address, functionName: "allow_evidence_host", args,
    fees: { distribution: estimate.distribution, feeValue: estimate.feeValue,
      ...(estimate.messageAllocations ? { messageAllocations: estimate.messageAllocations } : {}) } });
  record = { chainId: 4221, caller: account.address, adjudicator: address, method: "allow_evidence_host", args,
    transactionHash: String(hash), feeDeposit: String(estimate.feeValue), status: "submitted", expectedOutcome: "unauthorized write rejected" };
  writeFileSync(path, JSON.stringify(record, null, 2) + "\n");
  console.log("Submitted deliberate negative control", record.transactionHash);
}
if (record.transactionSubmitted === false) {
  console.log("Preserved verified pre-broadcast rejection:", record.diagnostic);
  process.exit(0);
}
for (let attempt = 0; attempt < 12; attempt++) {
  const response = await fetch("https://rpc-bradbury.genlayer.com", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "gen_getTransactionReceipt", params: [{ txId: record.transactionHash }] }), signal: AbortSignal.timeout(10000) });
  const packet = await response.json();
  if (packet.error) throw new Error(JSON.stringify(packet.error));
  const receipt = packet.result;
  record = { ...record, status: receipt.statusName, executionResult: receipt.txExecutionResultName,
    checkedAt: new Date().toISOString(), receipt };
  writeFileSync(path, JSON.stringify(record, null, 2) + "\n");
  console.log("Negative-control receipt", record.status, record.executionResult);
  if (record.status === "Finalized") {
    if (record.executionResult !== "FinishedWithError") throw new Error("Unauthorized mutation was not rejected");
    console.log("Finalized rejected write; inspect execution diagnostic before claiming authorization proof");
    break;
  }
  await new Promise(resolve => setTimeout(resolve, 2000));
}
