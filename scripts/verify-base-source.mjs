/** Publish only the already public, hash-matched Solidity source to Sourcify. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const path = process.argv[2];
const record = JSON.parse(readFileSync(path, "utf8"));
if (record.chainId !== 84532 || record.status !== "success") throw new Error("Only a confirmed Base Sepolia deployment is supported");
const source = readFileSync("contracts/base/src/CovraPools.sol", "utf8");
if (createHash("sha256").update(source).digest("hex") !== record.sourceSha256) throw new Error("Local source differs from deployment source");
let response;
if (record.sourcify?.verificationId) {
  response = await fetch("https://sourcify.dev/server/v2/verify/" + record.sourcify.verificationId, { signal: AbortSignal.timeout(30000) });
} else {
  response = await fetch(`https://sourcify.dev/server/v2/verify/84532/${record.contractAddress}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ stdJsonInput: { language: "Solidity", sources: { "CovraPools.sol": { content: source } },
      settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true,
        outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } },
      compilerVersion: record.compiler.split(".Emscripten")[0], contractIdentifier: "CovraPools.sol:CovraPools",
      creationTransactionHash: record.transactionHash }),
  });
}
const result = await response.json();
console.log("Sourcify HTTP", response.status, JSON.stringify(result));
record.sourcify = { ...record.sourcify, ...result, checkedAt: new Date().toISOString(), httpStatus: response.status };
writeFileSync(path, JSON.stringify(record, null, 2) + "\n");
if (!response.ok) process.exitCode = 1;
