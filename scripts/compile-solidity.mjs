import { readFileSync } from "node:fs";
import { join } from "node:path";
import solc from "solc";

const source = readFileSync(join(process.cwd(), "contracts/base/src/CovraPools.sol"), "utf8");
const test = readFileSync(join(process.cwd(), "contracts/base/test/CovraPools.t.sol"), "utf8");
const input = {
  language: "Solidity",
  sources: {
    "contracts/base/src/CovraPools.sol": { content: source },
    "contracts/base/test/CovraPools.t.sol": { content: test },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const compiled = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (compiled.errors || []).filter((item) => item.severity === "error");
for (const message of compiled.errors || []) {
  if (message.severity === "error" || message.severity === "warning") {
    process.stdout.write(`${message.severity.toUpperCase()}: ${message.formattedMessage}\n`);
  }
}
if (errors.length) process.exit(1);
const contract = compiled.contracts["contracts/base/src/CovraPools.sol"].CovraPools;
const behavioral = compiled.contracts["contracts/base/test/CovraPools.t.sol"].CovraPoolsTest;
if (!contract.evm.bytecode.object || !contract.abi.length) throw new Error("Empty compiled contract");
if (!behavioral?.abi.some((x) => x.name === "testThreeIndependentSignaturesPayBeneficiaryOnce")) {
  throw new Error("Foundry behavioral suite missing critical valid-settlement test");
}
process.stdout.write(`Compiled CovraPools successfully; ABI functions: ${contract.abi.filter((x) => x.type === "function").length}; bytecode: ${contract.evm.bytecode.object.length / 2} bytes.\n`);
process.stdout.write(`Compiled ${behavioral.abi.filter(x=>x.type==="function"&&x.name?.startsWith("test")).length} Foundry behavioral tests. Run with Forge to execute them.\n`);
