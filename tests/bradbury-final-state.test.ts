import { abi } from "genlayer-js";
import { bytesToHex } from "viem";
import { afterEach, expect, it, vi } from "vitest";
import { assertBradburyNodeIdentity, BRADBURY_PHASE_2_GENESIS, readFinalizedBradburyView } from "../src/lib/bradbury-final-state";

const endpoint = "https://bradbury.example.org";
const address = `0x${"ab".repeat(20)}`;
const success = (result: unknown) => Response.json({ jsonrpc: "2.0", id: 1, result });
afterEach(() => vi.unstubAllGlobals());

it("rejects a node reusing chain ID 4221 with the wrong genesis", async () => {
  const rpc = vi.fn().mockResolvedValueOnce(success("0x107d")).mockResolvedValueOnce(success({ hash: `0x${"00".repeat(32)}` }));
  vi.stubGlobal("fetch", rpc);
  await expect(assertBradburyNodeIdentity(endpoint)).rejects.toThrow(/genesis/);
  rpc.mockResolvedValueOnce(success("0x107d")).mockResolvedValueOnce(success({ hash: BRADBURY_PHASE_2_GENESIS }));
  await expect(assertBradburyNodeIdentity(endpoint)).resolves.toBeUndefined();
});

it("requests finalized state through the supported wire field and decodes its successful view output", async () => {
  const rpc = vi.fn().mockResolvedValueOnce(success({ status: { code: 0 }, data: bytesToHex(abi.calldata.encode("state")) }));
  vi.stubGlobal("fetch", rpc);
  await expect(readFinalizedBradburyView(endpoint, address, "get_case", ["case-id"])).resolves.toBe("state");
  const [url, request] = rpc.mock.calls[0];
  expect(url).toBe(endpoint);
  expect(request.redirect).toBe("error");
  const expectedData = abi.transactions.serialize([abi.calldata.encode(abi.calldata.makeCalldataObject("get_case", ["case-id"], undefined)), false]);
  expect(JSON.parse(request.body)).toMatchObject({ method: "gen_call", params: [{ type: "read", to: address, data: expectedData, status: "finalized" }] });
  expect(JSON.parse(request.body).params[0]).not.toHaveProperty("transaction_hash_variant");
  rpc.mockResolvedValueOnce(success({ status: { code: 1 }, data: "00" }));
  await expect(readFinalizedBradburyView(endpoint, address, "get_case", ["case-id"])).rejects.toThrow(/successfully/);
});
