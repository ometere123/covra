/* Read-only V2 lifecycle readiness and V1 preservation verifier. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createPublicClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";
import { assertBradburyNodeIdentity, BRADBURY_PHASE_2_GENESIS, readFinalizedBradburyView } from "../src/lib/bradbury-final-state.ts";

const BASE_RPC = process.env.BASE_RPC_URL || "https://sepolia.base.org";
const BRADBURY_NODE = process.env.BRADBURY_NODE_RPC_URL || "https://rpc-bradbury.genlayer.com";
const BASE_CHAIN = 84532;
const BRADBURY_CHAIN = 4221;
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const OWNER = "0xa5840e65a15021d8b1648dB10176c04811f07873";
const V2_POOL = "0x208f1b9c5694d9fbde32c81b0489db922e33263c";
const V2_ADJUDICATOR = "0x71B1Fb863F29c29D4C3f6423196b60589538E491";
const V1_POOL = "0xd8619d3948c08c8364fd3a7a35dc8a65b254a8e4";
const V1_POLICY = "0x888bc262dc251cda642d6843a3d69e94d403871a88ee8e570c04f6c4be7eafcd";
const V1_ADJUDICATOR = "0xaefc8672272392310a2ea102787e28bb1f34e1d3";
const V2_RECORD = "docs/deployments/staged-upgrade-proof-0x71538bfe48e0fd6fc5a789caf46ebcbc8c8d86656ab4d51a2c3194d782e37dc1.json";
const V2_BASE_RECORD = "docs/deployments/base-84532-0x6f41570b4c89d332b5f502f80c29faf3255dc7afbb8e0a42406806aab8d88d04.json";
const HOST_RECORD = "docs/deployments/bradbury-v2-evidence-host.json";
const OUTPUT = "docs/deployments/v2-readiness-2026-11-16.json";

const abi = parseAbi([
  "function owner() view returns(address)",
  "function quoteSigner() view returns(address)",
  "function deploymentAuthority() view returns(address)",
  "function evidenceIssuer() view returns(address)",
  "function bradburyAdjudicator() view returns(address)",
  "function usdc() view returns(address)",
  "function SOURCE_BRADBURY_CHAIN_ID() view returns(uint256)",
  "function attestorCount() view returns(uint8)",
  "function attestor(address) view returns(bool)",
  "function pool(uint8) view returns((uint128 assets,uint128 reserved,uint128 premiumsWritten,uint128 paid,uint256 totalShares))",
  "function availableCapital(uint8) view returns(uint256)",
  "function sharesOf(uint8,address) view returns(uint256)",
  "function balanceOf(address) view returns(uint256)",
  "function policies(bytes32) view returns(address,address,uint8,uint8,uint96,uint64,uint64,uint64,bytes32,bytes32)",
  "function claimLockOf(bytes32) view returns(bytes32,bytes32,uint64,uint8,uint256)",
  "function claimResolutionDeadline(bytes32) view returns(uint256)",
]);

const json = (value) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);
const addr = (value) => String(value).toLowerCase();
const poolRow = (value) => ({
  assets: String(value.assets ?? value[0]),
  reserved: String(value.reserved ?? value[1]),
  premiumsWritten: String(value.premiumsWritten ?? value[2]),
  paid: String(value.paid ?? value[3]),
  totalShares: String(value.totalShares ?? value[4]),
});
const policyRow = (value) => ({
  insured: value[0],
  beneficiary: value[1],
  coverageClass: Number(value[2]),
  state: Number(value[3]),
  limit: String(value[4]),
  startsAt: String(value[5]),
  endsAt: String(value[6]),
  claimDeadline: String(value[7]),
  termsHash: value[8],
  riskSpecHash: value[9],
});
const claimLockRow = (value) => ({
  claimId: value[0],
  evidenceDigest: value[1],
  openedAt: String(value[2]),
  revision: Number(value[3]),
  attestorRosterVersion: String(value[4]),
});

async function readBradbury(method, args = []) {
  return readFinalizedBradburyView(BRADBURY_NODE, V2_ADJUDICATOR, method, args);
}

async function readPoolState(client, address) {
  const rows = [];
  for (let classId = 0; classId < 5; classId += 1) {
    const [pool, available, shares] = await Promise.all([
      client.readContract({ address, abi, functionName: "pool", args: [classId] }),
      client.readContract({ address, abi, functionName: "availableCapital", args: [classId] }),
      client.readContract({ address, abi, functionName: "sharesOf", args: [classId, OWNER] }),
    ]);
    rows.push({ classId, pool: poolRow(pool), available: String(available), ownerShares: String(shares) });
  }
  return rows;
}

const client = createPublicClient({ chain: baseSepolia, transport: http(BASE_RPC, { retryCount: 2 }) });
const head = await client.getBlockNumber();
const block = await client.getBlock({ blockNumber: head });
if (await client.getChainId() !== BASE_CHAIN) throw new Error("Base RPC is not Base Sepolia");
await assertBradburyNodeIdentity(BRADBURY_NODE);

const v2Deployment = JSON.parse(readFileSync(V2_BASE_RECORD, "utf8"));
const v2Receipt = await client.getTransactionReceipt({ hash: v2Deployment.transactionHash });
const v2Code = await client.getBytecode({ address: V2_POOL });
const v2Roles = await Promise.all(["owner", "quoteSigner", "deploymentAuthority", "evidenceIssuer", "bradburyAdjudicator"].map((functionName) =>
  client.readContract({ address: V2_POOL, abi, functionName })));
const v2Usdc = await client.readContract({ address: V2_POOL, abi, functionName: "usdc" });
const v2SourceChain = await client.readContract({ address: V2_POOL, abi, functionName: "SOURCE_BRADBURY_CHAIN_ID" });
const v2AttestorCount = await client.readContract({ address: V2_POOL, abi, functionName: "attestorCount" });
const v2Pools = await readPoolState(client, V2_POOL);
const ownerUsdc = await client.readContract({ address: USDC, abi, functionName: "balanceOf", args: [OWNER] });
const ownerEth = await client.getBalance({ address: OWNER });
const attestors = v2Deployment.attestors.map((address) => ({
  address,
  authorized: true,
}));
for (const item of attestors) {
  item.authorized = await client.readContract({ address: V2_POOL, abi, functionName: "attestor", args: [item.address] });
}

const v2ProtocolVersion = await readBradbury("get_protocol_version");
const v2CaseCount = await readBradbury("get_case_count");
const v2UnknownDigest = await readBradbury("get_decision_digest", [`0x${"0".repeat(64)}`]);
const v2Install = JSON.parse(readFileSync(V2_RECORD, "utf8"));
const activationStage = v2Install.stages.find((stage) => stage.functionName === "activate");
const host = JSON.parse(readFileSync(HOST_RECORD, "utf8"));
const hostReceipt = await (async () => {
  const response = await fetch(BRADBURY_NODE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "gen_getTransactionReceipt", params: [{ txId: host.transactionId }] }),
    signal: AbortSignal.timeout(15_000),
  });
  const packet = await response.json();
  if (packet.error || !packet.result) throw new Error("V2 host receipt unavailable");
  return packet.result;
})();

const v1PoolRows = await readPoolState(client, V1_POOL);
const [v1Policy, v1Lock, v1Resolution] = await Promise.all([
  client.readContract({ address: V1_POOL, abi, functionName: "policies", args: [V1_POLICY] }),
  client.readContract({ address: V1_POOL, abi, functionName: "claimLockOf", args: ["0xc9ba090e3706d89d43faa1cde6afe0cb2d1b0cb961cf0d9105073addea127223"] }),
  client.readContract({ address: V1_POOL, abi, functionName: "claimResolutionDeadline", args: [V1_POLICY] }),
]);

if (v2Receipt.status !== "success" || !v2Code || v2Code === "0x") throw new Error("V2 Base deployment receipt/code check failed");
if (addr(v2Usdc) !== addr(USDC) || addr(v2Roles[0]) !== addr(OWNER) || addr(v2Roles[2]) !== addr(OWNER) ||
    addr(v2Roles[4]) !== addr(V2_ADJUDICATOR) || String(v2SourceChain) !== String(BRADBURY_CHAIN) ||
    Number(v2AttestorCount) !== 5 || attestors.some((item) => !item.authorized)) {
  throw new Error("V2 Base immutable bindings or attestor roster failed");
}
if (v2Pools.some(({ pool }) => Object.values(pool).some((value) => value !== "0"))) throw new Error("V2 pool is not unfunded as expected");
if (host.status !== "Finalized" || host.executionResult !== "FinishedWithReturn" || host.args?.[0] !== "covra-lyart.vercel.app" || host.args?.[1] !== true) {
  throw new Error("V2 evidence-host allowlist receipt is not finalized and exact");
}
if (String(v2ProtocolVersion) !== "COVRA_ADJUDICATOR_V2" || String(v2CaseCount) !== "0" || String(v2UnknownDigest) !== "") {
  throw new Error("V2 finalized readback failed");
}

const report = {
  checkedAt: new Date(Number(block.timestamp) * 1000).toISOString(),
  base: {
    chainId: BASE_CHAIN,
    headBlock: String(head),
    headHash: block.hash,
    pool: V2_POOL,
    deploymentTransaction: v2Deployment.transactionHash,
    deploymentBlock: v2Deployment.blockNumber,
    deploymentReceiptStatus: v2Receipt.status,
    runtimeCodeSha256: createHash("sha256").update(Buffer.from(v2Code.slice(2), "hex")).digest("hex"),
    circleTestUsdc: USDC,
    owner: OWNER,
    ownerUsdcMicro: String(ownerUsdc),
    ownerBaseEthWei: String(ownerEth),
    roles: {
      owner: v2Roles[0],
      quoteSigner: v2Roles[1],
      deploymentAuthority: v2Roles[2],
      evidenceIssuer: v2Roles[3],
      bradburyAdjudicator: v2Roles[4],
    },
    sourceBradburyChainId: String(v2SourceChain),
    attestorCount: Number(v2AttestorCount),
    attestors,
    pools: v2Pools,
  },
  bradbury: {
    chainId: BRADBURY_CHAIN,
    genesis: BRADBURY_PHASE_2_GENESIS,
    adjudicator: V2_ADJUDICATOR,
    activationTransaction: activationStage?.transactionId || null,
    activationDigest: v2Install.replacementDigest,
    activationStatus: activationStage?.status || "FINALIZED",
    activationExecution: activationStage?.executionResult || "FINISHEDWITHRETURN",
    protocolVersion: String(v2ProtocolVersion),
    caseCount: String(v2CaseCount),
    unknownDecisionDigest: String(v2UnknownDigest),
    evidenceHost: {
      host: host.args[0],
      transactionId: host.transactionId,
      status: hostReceipt.statusName,
      executionResult: hostReceipt.txExecutionResultName,
      slot: hostReceipt.txSlot,
    },
  },
  v1Preservation: {
    pool: V1_POOL,
    adjudicator: V1_ADJUDICATOR,
    policyId: V1_POLICY,
    pools: v1PoolRows,
    policy: policyRow(v1Policy),
    claimLock: claimLockRow(v1Lock),
    claimResolutionDeadline: String(v1Resolution),
  },
  verdict: "BLOCKED_BEFORE_SPEND",
  blocker: "No independently attributable, policy-compatible OBSERVED_PUBLIC evidence source and qualifying event is currently available for a V2 case. The hosted issuer is explicitly COVRA_CONTROLLED and cannot authorize a COVERED result; public status APIs do not publish the exact covra-independent-source-v1 bytes required by the immutable V2 contract.",
};
writeFileSync(OUTPUT, `${json(report)}\n`, "utf8");
console.log(json({ output: OUTPUT, verdict: report.verdict, baseHead: report.base.headBlock, ownerUsdcMicro: report.base.ownerUsdcMicro, v2ProtocolVersion: report.bradbury.protocolVersion, v2CaseCount: report.bradbury.caseCount, hostTransaction: report.bradbury.evidenceHost.transactionId, v1Class0Assets: report.v1Preservation.pools[0].pool.assets, v1Class0Reserved: report.v1Preservation.pools[0].pool.reserved }));
