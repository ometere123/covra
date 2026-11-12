import { afterEach, describe, expect, it, vi } from "vitest";
import { activeContractVersion, configuredDeployment } from "@/lib/deployment-config.mjs";

afterEach(() => vi.unstubAllEnvs());

describe("versioned contract deployment routing", () => {
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
