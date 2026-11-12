import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import solc from "solc";
import { createPublicClient, createWalletClient, http, isAddress } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// Intentionally TESTNET ONLY. No mainnet deployment path.
if (process.env.COVRA_ENV !== "testnet" || process.env.COVRA_DEPLOY_CONFIRM !== "TESTNET_ONLY") {
  throw new Error("Refusing deployment: set COVRA_ENV=testnet and COVRA_DEPLOY_CONFIRM=TESTNET_ONLY");
}
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const quoteKey = process.env.QUOTE_SIGNER_PRIVATE_KEY;
const deploymentVersion = process.env.COVRA_DEPLOYMENT_VERSION === "V2" ? "V2" : "V1";
if (deploymentVersion === "V2" && process.env.NEXT_PUBLIC_COVRA_DEPLOYMENT_VERSION !== "V2") {
  throw new Error("V2 Base deployment requires explicit NEXT_PUBLIC_COVRA_DEPLOYMENT_VERSION=V2 opt-in");
}
const adjudicator = deploymentVersion === "V2"
  ? process.env.BRADBURY_ADJUDICATOR_V2_ADDRESS
  : process.env.BRADBURY_ADJUDICATOR_ADDRESS;
const evidenceIssuer = process.env.EVIDENCE_ISSUER_WALLET;
const usdc = process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS;
const attestors = [1, 2, 3, 4, 5].map((n) => process.env[`ATTESTOR_ADDRESS_${n}`]);
if (!privateKey || !quoteKey || !adjudicator || !evidenceIssuer || !usdc ||
    !isAddress(adjudicator) || !isAddress(evidenceIssuer) || !isAddress(usdc) ||
    attestors.some((address) => !address || !isAddress(address)) ||
    new Set(attestors.map((address) => address.toLowerCase())).size !== 5) {
  throw new Error("Missing/invalid deployment key, quote signer, Bradbury adjudicator or five unique attestor addresses");
}
const source = readFileSync(join(process.cwd(), "contracts/base/src/CovraPools.sol"), "utf8");
const input = {
  language: "Solidity", sources: { "CovraPools.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 }, viaIR: true,
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const compilationErrors = (output.errors || []).filter((e) => e.severity === "error");
if (compilationErrors.length) throw new Error(compilationErrors.map((e) => e.formattedMessage).join("\n"));
const compiled = output.contracts["CovraPools.sol"].CovraPools;
const rpc = process.env.BASE_RPC_URL || "https://sepolia.base.org";
const client = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
if (await client.getChainId() !== 84532) throw new Error("RPC is not Base Sepolia 84532");
if (usdc.toLowerCase() !== "0x036cbd53842c5426634e7929541ec2318f3dcf7e".toLowerCase()) throw new Error("Only official Circle Base Sepolia USDC is authorized");
if (!(await client.getBytecode({ address: usdc }))) throw new Error("USDC address has no deployed code");
const owner = privateKeyToAccount(privateKey);
const signer = privateKeyToAccount(quoteKey);
if (owner.address.toLowerCase() === signer.address.toLowerCase() ||
    owner.address.toLowerCase() === evidenceIssuer.toLowerCase() ||
    signer.address.toLowerCase() === evidenceIssuer.toLowerCase() ||
    attestors.some((address) => address.toLowerCase() === owner.address.toLowerCase() ||
      address.toLowerCase() === signer.address.toLowerCase() ||
      address.toLowerCase() === evidenceIssuer.toLowerCase())) {
  throw new Error("Deployment, quote, evidence-issuer and attestor identities must be distinct");
}
const wallet = createWalletClient({ account: owner, chain: baseSepolia, transport: http(rpc) });
process.stdout.write(`Deploying COVRA TESTNET on Base Sepolia with owner ${owner.address}; USDC ${usdc}; quote signer ${signer.address}; evidence issuer ${evidenceIssuer}; adjudicator ${adjudicator}\n`);
const hash = await wallet.deployContract({
  abi: compiled.abi, bytecode: `0x${compiled.evm.bytecode.object}`,
  args: [usdc, signer.address, adjudicator, evidenceIssuer, attestors, 84532n],
});
// Persist the submitted hash before waiting, so interruptions never require a duplicate deployment.
mkdirSync(join(process.cwd(), "docs/deployments"), { recursive: true });
const recordPath = join(process.cwd(), "docs/deployments", `base-84532-${hash}.json`);
const record = { chainId: 84532, transactionHash: hash, status: "submitted",
  deploymentVersion, sourceSha256: createHash("sha256").update(source).digest("hex"), compiler: solc.version(),
  owner: owner.address, quoteSigner: signer.address, evidenceIssuer, adjudicator, usdc, attestors };
writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n");
process.stdout.write(`SUBMITTED ${hash}; durable record ${recordPath}\n`);
const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2 });
writeFileSync(recordPath, JSON.stringify({ ...record, status: receipt.status,
  contractAddress: receipt.contractAddress, blockNumber: String(receipt.blockNumber),
  blockHash: receipt.blockHash, gasUsed: String(receipt.gasUsed) }, null, 2) + "\n");
if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`Deployment reverted: ${hash}`);
const poolVariable = deploymentVersion === "V2" ? "NEXT_PUBLIC_COVRA_POOLS_V2_ADDRESS" : "NEXT_PUBLIC_COVRA_POOLS_ADDRESS";
process.stdout.write(`CONFIRMED TESTNET DEPLOYMENT\nversion=${deploymentVersion}\ncontract=${receipt.contractAddress}\ntransaction=${hash}\nblock=${receipt.blockNumber}\nSet ${poolVariable} and BASE_DEPLOYMENT_START_BLOCK in .env.local.\n`);
