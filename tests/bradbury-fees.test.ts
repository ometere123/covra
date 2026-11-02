import { afterEach, expect, it, vi } from "vitest";
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { encodeAbiParameters } from "viem";

afterEach(() => vi.unstubAllGlobals());

it("preserves the funded caller and policy gas price in RC2 FeeManager simulation", async () => {
  const caller = "0x1111111111111111111111111111111111111111";
  const calls: { method: string; params: Record<string, unknown>[] }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
    const request = JSON.parse(options.body);
    calls.push(request);
    let result: unknown = "0x1";
    if (request.method === "eth_call") {
      const data = request.params[0].data;
      const simulation = request.params[0].gasPrice;
      if (simulation) {
        expect(request.params[0].from.toLowerCase()).toBe(caller);
        expect(BigInt(simulation)).toBeGreaterThan(0n);
        result = encodeAbiParameters([{ type: "uint256" }], [1000n]);
      } else {
        // FeeManager boolean and integer views are ABI words. Returning one
        // enables fees; calculateRoundFees must also produce a nonzero word.
        result = encodeAbiParameters([{ type: "uint256" }], [1n]);
      }
      expect(data).toMatch(/^0x/);
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
  }));
  const client = createClient({ chain: testnetBradbury, endpoint: "https://rpc-bradbury.genlayer.com", account: caller });
  const estimate = await client.estimateTransactionFees({});
  expect(estimate.feeValue).toBeGreaterThan(0n);
  expect(calls.some(call => call.method === "eth_call" && call.params[0].gasPrice)).toBe(true);
  expect(calls.every(call => !["eth_sendTransaction", "eth_sendRawTransaction"].includes(call.method))).toBe(true);
});
