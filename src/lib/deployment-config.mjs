function address(value) {
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) ? value : null;
}

function publicAddress(version, kind) {
  if (version === "V2") {
    return address(kind === "pool"
      ? process.env.NEXT_PUBLIC_COVRA_POOLS_V2_ADDRESS
      : process.env.NEXT_PUBLIC_BRADBURY_ADJUDICATOR_V2_ADDRESS);
  }
  return address(kind === "pool"
    ? process.env.NEXT_PUBLIC_COVRA_POOLS_ADDRESS
    : process.env.NEXT_PUBLIC_BRADBURY_ADJUDICATOR_ADDRESS);
}

export function configuredDeployment(version) {
  const poolAddress = publicAddress(version, "pool");
  const adjudicatorAddress = publicAddress(version, "adjudicator");
  return { version, poolAddress, adjudicatorAddress, configured: Boolean(poolAddress && adjudicatorAddress) };
}

export function activeContractVersion() {
  if (process.env.NEXT_PUBLIC_COVRA_DEPLOYMENT_VERSION !== "V2") return "V1";
  return configuredDeployment("V2").configured ? "V2" : "V1";
}

export function activeDeployment() {
  return configuredDeployment(activeContractVersion());
}
