import { afterEach, describe, expect, it, vi } from "vitest";
import { activeContractVersion, configuredDeployment, historicalDeploymentForPool } from "@/lib/deployment-config.mjs";

afterEach(() => vi.unstubAllEnvs());

describe("versioned contract deployment routing", () => {
  it("resolves the recorded V1 pair independently of the current configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_COVRA_DEPLOYMENT_VERSION", "V2");
    vi.stubEnv("NEXT_PUBLIC_COVRA_POOLS_ADDRESS", "");
    vi.stubEnv("NEXT_PUBLIC_BRADBURY_ADJUDICATOR_ADDRESS", "");
    expect(historicalDeploymentForPool("0xd8619D3948c08c8364fd3a7a35dc8a65b254a8e4")).toMatchObject({
      version: "V1",
      adjudicatorAddress: "0xaefc8672272392310a2ea102787e28bb1f34e1d3",
    });
  });

  it("rejects a V3 alias for a historical pool", () => {
    const pool = "0x208f1b9c5694d9fbde32c81b0489db922e33263c";
    vi.stubEnv("NEXT_PUBLIC_COVRA_POOLS_V3_ADDRESS", pool);
    expect(() => historicalDeploymentForPool(pool)).toThrow("conflicts");
  });

  it("recognizes V3 configuration without enabling active V3 flows", () => {
    const pool = "0x5555555555555555555555555555555555555555";
    vi.stubEnv("NEXT_PUBLIC_COVRA_DEPLOYMENT_VERSION", "V3");
    vi.stubEnv("NEXT_PUBLIC_COVRA_POOLS_V3_ADDRESS", pool);
    vi.stubEnv("NEXT_PUBLIC_BRADBURY_ADJUDICATOR_V3_ADDRESS", "0x0000000000000000000000000000000000000000");
    expect(() => historicalDeploymentForPool(pool)).toThrow("unique complete deployment");
    vi.stubEnv("NEXT_PUBLIC_BRADBURY_ADJUDICATOR_V3_ADDRESS", "0x6666666666666666666666666666666666666666");
    expect(historicalDeploymentForPool(pool).version).toBe("V3");
    expect(() => activeContractVersion()).toThrow("V3 cannot be selected");
  });
  it("keeps V1 active when V2 is absent or only partially configured", () => {
    vi.stubEnv("NEXT_PUBLIC_COVRA_POOLS_ADDRESS", "0x1111111111111111111111111111111111111111");
    vi.stubEnv("NEXT_PUBLIC_BRADBURY_ADJUDICATOR_ADDRESS", "0x2222222222222222222222222222222222222222");
    vi.stubEnv("NEXT_PUBLIC_COVRA_DEPLOYMENT_VERSION", "V2");
    vi.stubEnv("NEXT_PUBLIC_COVRA_POOLS_V2_ADDRESS", "0x3333333333333333333333333333333333333333");
    expect(activeContractVersion()).toBe("V1");
    expect(configuredDeployment("V2").configured).toBe(false);
  });

  it("requires explicit opt-in and both V2 addresses before activation", () => {
    vi.stubEnv("NEXT_PUBLIC_COVRA_DEPLOYMENT_VERSION", "V2");
    vi.stubEnv("NEXT_PUBLIC_COVRA_POOLS_V2_ADDRESS", "0x3333333333333333333333333333333333333333");
    vi.stubEnv("NEXT_PUBLIC_BRADBURY_ADJUDICATOR_V2_ADDRESS", "0x4444444444444444444444444444444444444444");
    expect(configuredDeployment("V2")).toMatchObject({
      version: "V2",
      configured: true,
      poolAddress: "0x3333333333333333333333333333333333333333",
      adjudicatorAddress: "0x4444444444444444444444444444444444444444",
    });
    expect(activeContractVersion()).toBe("V2");
  });

  it("does not activate V2 for malformed public addresses", () => {
    vi.stubEnv("NEXT_PUBLIC_COVRA_DEPLOYMENT_VERSION", "V2");
    vi.stubEnv("NEXT_PUBLIC_COVRA_POOLS_V2_ADDRESS", "not-an-address");
    vi.stubEnv("NEXT_PUBLIC_BRADBURY_ADJUDICATOR_V2_ADDRESS", "0x4444444444444444444444444444444444444444");
    expect(activeContractVersion()).toBe("V1");
  });
});
