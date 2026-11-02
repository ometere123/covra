import { afterEach, describe, expect, it } from "vitest";
import { publicBradburyEndpoint } from "@/lib/bradbury-client";

const originalEndpoint = process.env.NEXT_PUBLIC_BRADBURY_NODE_RPC_URL;

afterEach(() => {
  if (originalEndpoint === undefined) delete process.env.NEXT_PUBLIC_BRADBURY_NODE_RPC_URL;
  else process.env.NEXT_PUBLIC_BRADBURY_NODE_RPC_URL = originalEndpoint;
});

describe("public Bradbury node endpoint boundary", () => {
  it("fails closed when the browser endpoint is not configured", () => {
    delete process.env.NEXT_PUBLIC_BRADBURY_NODE_RPC_URL;
    expect(publicBradburyEndpoint()).toBeNull();
  });

  it("rejects the EVM chain RPC and credential-bearing URLs", () => {
    process.env.NEXT_PUBLIC_BRADBURY_NODE_RPC_URL = "https://rpc.testnet-chain.genlayer.com";
    expect(publicBradburyEndpoint()).toBeNull();

    process.env.NEXT_PUBLIC_BRADBURY_NODE_RPC_URL = "https://rpc-bradbury.genlayer.com?token=secret";
    expect(publicBradburyEndpoint()).toBeNull();

    process.env.NEXT_PUBLIC_BRADBURY_NODE_RPC_URL = "https://user:pass@rpc-bradbury.genlayer.com";
    expect(publicBradburyEndpoint()).toBeNull();
  });

  it("accepts only a plain HTTPS GenLayer node URL", () => {
    process.env.NEXT_PUBLIC_BRADBURY_NODE_RPC_URL = "https://rpc-bradbury.genlayer.com";
    expect(publicBradburyEndpoint()).toBe("https://rpc-bradbury.genlayer.com/");
  });
});
