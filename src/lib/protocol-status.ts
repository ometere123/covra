import { baseClient, configuredPoolAddress, poolsAbi } from "@/lib/chain";
import { configuredAdjudicator, publicBradburyEndpoint } from "@/lib/bradbury-client";
import { assertBradburyNodeIdentity, readFinalizedBradburyView } from "@/lib/bradbury-final-state";
import { coverages } from "@/lib/catalog";

export type DeploymentState = "LOADING" | "DEPLOYED" | "DEPLOYED_UNFUNDED" | "UNAVAILABLE";

export type PoolDeploymentStatus = {
  state: DeploymentState;
  address: string | null;
  assetsMicroUsdc: string | null;
  reservedMicroUsdc: string | null;
  message: string;
};

export type AdjudicatorDeploymentStatus = {
  state: DeploymentState;
  address: string | null;
  finalizedCaseCount: string | null;
  message: string;
};

export type ProtocolStatus = {
  checkedAt: string;
  pool: PoolDeploymentStatus;
  adjudicator: AdjudicatorDeploymentStatus;
  settlement: {
    state: "NOT_READY" | "CLAIM_SPECIFIC_PREREQUISITES" | "UNAVAILABLE";
    message: string;
  };
};

const unavailablePool = (message: string): PoolDeploymentStatus => ({
  state: "UNAVAILABLE", address: null, assetsMicroUsdc: null, reservedMicroUsdc: null, message,
});

const unavailableAdjudicator = (message: string): AdjudicatorDeploymentStatus => ({
  state: "UNAVAILABLE", address: null, finalizedCaseCount: null, message,
});

async function readPoolStatus(): Promise<PoolDeploymentStatus> {
  const address = configuredPoolAddress();
  if (!address) return unavailablePool("Base Sepolia pool address is not configured.");
  try {
    const [chainId, bytecode, pools] = await Promise.all([
      baseClient.getChainId(),
      baseClient.getBytecode({ address }),
      Promise.all(coverages.map(risk => baseClient.readContract({
        address, abi: poolsAbi, functionName: "pool", args: [risk.id],
      }))),
    ]);
    if (chainId !== 84532 || !bytecode || bytecode === "0x") {
      return unavailablePool("The configured pool could not be verified on Base Sepolia.");
    }
    const assets = pools.reduce((total, value) => total + value.assets, 0n);
    const reserved = pools.reduce((total, value) => total + value.reserved, 0n);
    return {
      state: assets === 0n ? "DEPLOYED_UNFUNDED" : "DEPLOYED",
      address,
      assetsMicroUsdc: assets.toString(),
      reservedMicroUsdc: reserved.toString(),
      message: assets === 0n
        ? "Verified Base Sepolia pool; no USDC capital is currently deposited."
        : "Verified Base Sepolia pool with live USDC capital.",
    };
  } catch {
    return unavailablePool("Base Sepolia pool verification is temporarily unavailable.");
  }
}

async function readAdjudicatorStatus(): Promise<AdjudicatorDeploymentStatus> {
  const address = configuredAdjudicator();
  const endpoint = publicBradburyEndpoint();
  if (!address) return unavailableAdjudicator("Bradbury adjudicator address is not configured.");
  if (!endpoint) return unavailableAdjudicator("Bradbury Phase 2 execution endpoint is not configured.");
  try {
    await assertBradburyNodeIdentity(endpoint);
    const caseCount = await readFinalizedBradburyView(endpoint, address, "get_case_count", []);
    return {
      state: "DEPLOYED",
      address,
      finalizedCaseCount: typeof caseCount === "bigint" ? caseCount.toString() : String(caseCount),
      message: "Verified Bradbury Phase 2 adjudicator and finalized read path.",
    };
  } catch {
    return unavailableAdjudicator("Bradbury Phase 2 could not verify the configured adjudicator.");
  }
}

export async function readProtocolStatus(): Promise<ProtocolStatus> {
  const [poolResult, adjudicatorResult] = await Promise.allSettled([readPoolStatus(), readAdjudicatorStatus()]);
  const pool = poolResult.status === "fulfilled" ? poolResult.value : unavailablePool("Base Sepolia pool verification failed.");
  const adjudicator = adjudicatorResult.status === "fulfilled" ? adjudicatorResult.value : unavailableAdjudicator("Bradbury adjudicator verification failed.");
  const bothDeployed = pool.state === "DEPLOYED" || pool.state === "DEPLOYED_UNFUNDED";
  const settlement = !bothDeployed || adjudicator.state !== "DEPLOYED"
    ? { state: "UNAVAILABLE" as const, message: "Settlement readiness cannot be established until both deployments verify." }
    : pool.state === "DEPLOYED_UNFUNDED"
      ? { state: "NOT_READY" as const, message: "Deployments verify, but no pool capital is available for a policy or payout." }
      : { state: "CLAIM_SPECIFIC_PREREQUISITES" as const, message: "Capital is detected; each settlement still requires a frozen policy, finalized decision and valid attestor quorum." };
  return { checkedAt: new Date().toISOString(), pool, adjudicator, settlement };
}
