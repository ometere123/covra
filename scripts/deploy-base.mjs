import { readFileSync } from "node:fs";
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
const adjudicator = process.env.BRADBURY_ADJUDICATOR_ADDRESS;
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
if (!(await client.getBytecode({ address: usdc }))) throw new Error("USDC address has no deployed code");
const owner = privateKeyToAccount(privateKey);
const signer = privateKeyToAccount(quoteKey);
if (owner.address.toLowerCase() === evidenceIssuer.toLowerCase() ||
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
const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2 });
if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`Deployment reverted: ${hash}`);
process.stdout.write(`CONFIRMED TESTNET DEPLOYMENT\ncontract=${receipt.contractAddress}\ntransaction=${hash}\nblock=${receipt.blockNumber}\nSet NEXT_PUBLIC_COVRA_POOLS_ADDRESS and BASE_DEPLOYMENT_START_BLOCK in .env.local.\n`);
