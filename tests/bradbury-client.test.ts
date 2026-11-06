import { afterEach, describe, expect, it, vi } from "vitest";
import type { EIP1193Provider } from "viem";
import { publicBradburyEndpoint, writeBradburyAction } from "@/lib/bradbury-client";

const sdk = vi.hoisted(() => ({
  connect: vi.fn(),
  estimateTransactionFeesForWrite: vi.fn(),
  writeContract: vi.fn(),
  waitForFinalization: vi.fn(),
}));
vi.mock("genlayer-js", () => ({ createClient: () => sdk }));

const originalEndpoint = process.env.NEXT_PUBLIC_BRADBURY_NODE_RPC_URL;

afterEach(() => {
  vi.resetAllMocks();
  if (originalEndpoint === undefined) delete process.env.NEXT_PUBLIC_BRADBURY_NODE_RPC_URL;
  else process.env.NEXT_PUBLIC_BRADBURY_NODE_RPC_URL = originalEndpoint;
});

describe("Bradbury submission recovery", () => {
  const wallet = "0x1111111111111111111111111111111111111111";
  const adjudicator = "0x2222222222222222222222222222222222222222";
  const txHash = "0x" + "33".repeat(32);
  const genesis = "0x17d89764d4f4f963158fc4c5e8f2cb670c2837740b35f37081c12860c3df97e4";
  function setup(hash = genesis) {
    process.env.NEXT_PUBLIC_BRADBURY_NODE_RPC_URL = "https://rpc-bradbury.genlayer.com";
    sdk.estimateTransactionFeesForWrite.mockResolvedValue({ feeValue: 12n, distribution: [] });
    sdk.writeContract.mockResolvedValue(txHash);
    const provider = {
      request: async ({ method }: { method: string }) => method === "eth_chainId" ? "0x107d" : { hash },
    } as unknown as EIP1193Provider;
    return provider;
  }

  it("hands the original hash to recovery before a finality timeout", async () => {
    const provider = setup();
    const submitted = vi.fn();
    sdk.waitForFinalization.mockImplementation(async (options) => {
      expect(submitted).toHaveBeenCalledWith({ txHash, feeDeposit: "12" });
      expect(options).toEqual({ hash: txHash, fullTransaction: true });
      throw new Error("timeout");
    });
    await expect(writeBradburyAction(provider, wallet, adjudicator, "adjudicate", ["claim"], submitted))
      .rejects.toThrow(txHash);
    expect(sdk.writeContract).toHaveBeenCalledTimes(1);
  });

  it("rejects a mismatched phase genesis before quoting or broadcasting", async () => {
    await expect(writeBradburyAction(setup(txHash), wallet, adjudicator, "adjudicate", ["claim"]))
      .rejects.toThrow("genesis");
    expect(sdk.estimateTransactionFeesForWrite).not.toHaveBeenCalled();
    expect(sdk.writeContract).not.toHaveBeenCalled();
  });

  it.each(["ACCEPTED", "FINALIZED"])("checks exact receipt data even when polling returns %s", async (statusName) => {
    const provider = setup();
    sdk.waitForFinalization.mockResolvedValue({
      id: txHash, statusName, txExecutionResultName: "FINISHED_WITH_RETURN", recipient: adjudicator,
      txDataDecoded: { type: "call", callData: new Map<string, unknown>([["", "adjudicate"], ["args", ["claim"]]]) },
    });
    const result = writeBradburyAction(provider, wallet, adjudicator, "adjudicate", ["claim"]);
    if (statusName === "FINALIZED") await expect(result).resolves.toEqual({ txHash, feeDeposit: "12" });
    else await expect(result).rejects.toThrow("not finalized");
  });
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
