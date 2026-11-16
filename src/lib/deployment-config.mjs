function address(value) {
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value) ? value : null;
}

function publicAddress(version, kind) {
  if (version === "V3") {
    return address(kind === "pool"
      ? process.env.NEXT_PUBLIC_COVRA_POOLS_V3_ADDRESS
      : process.env.NEXT_PUBLIC_BRADBURY_ADJUDICATOR_V3_ADDRESS);
  }
  if (version === "V2") {
    return address(kind === "pool"
      ? process.env.NEXT_PUBLIC_COVRA_POOLS_V2_ADDRESS
      : process.env.NEXT_PUBLIC_BRADBURY_ADJUDICATOR_V2_ADDRESS);
  }
  if (version !== "V1") throw new Error("Unsupported contract version");
  return address(kind === "pool"
    ? process.env.NEXT_PUBLIC_COVRA_POOLS_ADDRESS
    : process.env.NEXT_PUBLIC_BRADBURY_ADJUDICATOR_ADDRESS);
}

const historicalPairs = [
  ["V1", "0xd8619d3948c08c8364fd3a7a35dc8a65b254a8e4", "0xaefc8672272392310a2ea102787e28bb1f34e1d3"],
  ["V2", "0x208f1b9c5694d9fbde32c81b0489db922e33263c", "0x71B1Fb863F29c29D4C3f6423196b60589538E491"],
];

export function historicalDeploymentForPool(poolAddress) {
  const pool = address(poolAddress)?.toLowerCase();
  if (!pool) throw new Error("Missing or invalid originating pool address");
  const historical = historicalPairs.find(([, knownPool]) => knownPool === pool);
  const matches = ["V1", "V2", "V3"].map(configuredDeployment)
    .filter(candidate => candidate.poolAddress?.toLowerCase() === pool);
  if (historical) {
    const [version, knownPool, adjudicatorAddress] = historical;
    if (matches.some(candidate => candidate.version !== version ||
        (candidate.adjudicatorAddress && candidate.adjudicatorAddress.toLowerCase() !== adjudicatorAddress.toLowerCase())))
      throw new Error("Configuration conflicts with the recorded historical deployment");
    return { version, poolAddress: knownPool, adjudicatorAddress, configured: true };
  }
  if (matches.length !== 1 || !matches[0].configured)
    throw new Error("Originating pool does not identify a unique complete deployment");
  return matches[0];
}

export function configuredDeployment(version) {
  const poolAddress = publicAddress(version, "pool");
  const adjudicatorAddress = publicAddress(version, "adjudicator");
  return { version, poolAddress, adjudicatorAddress, configured: Boolean(poolAddress && adjudicatorAddress) };
}

export function activeContractVersion() {
  if (process.env.NEXT_PUBLIC_COVRA_DEPLOYMENT_VERSION === "V3")
    throw new Error("V3 cannot be selected as the active deployment until transactional verification is available");
  if (process.env.NEXT_PUBLIC_COVRA_DEPLOYMENT_VERSION !== "V2") return "V1";
  return configuredDeployment("V2").configured ? "V2" : "V1";
}

export function activeDeployment() {
  return configuredDeployment(activeContractVersion());
}
