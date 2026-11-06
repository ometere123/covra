import { abi } from "genlayer-js";
import { hexToBytes, zeroAddress } from "viem";

export const BRADBURY_PHASE_2_GENESIS = "0x17d89764d4f4f963158fc4c5e8f2cb670c2837740b35f37081c12860c3df97e4";

async function nodeRequest(endpoint: string, method: string, params: unknown[]) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Bradbury node ${method} returned HTTP ${response.status}`);
  const packet = await response.json();
  if (packet?.jsonrpc !== "2.0" || packet.id !== 1 || packet.error || packet.result == null) {
    throw new Error(`Bradbury node rejected ${method} or returned a malformed response`);
  }
  return packet.result;
}

export async function assertBradburyNodeIdentity(endpoint: string) {
  const [chain, genesis] = await Promise.all([
    nodeRequest(endpoint, "eth_chainId", []),
    nodeRequest(endpoint, "eth_getBlockByNumber", ["0x0", false]),
  ]);
  if (chain !== "0x107d" || genesis?.hash?.toLowerCase() !== BRADBURY_PHASE_2_GENESIS) {
    throw new Error("The execution node does not match Bradbury Phase 2 chain ID and genesis");
  }
}

export async function readFinalizedBradburyView(endpoint: string, address: string, method: string, args: string[]) {
  const call = abi.calldata.makeCalldataObject(method, args, undefined);
  const data = abi.transactions.serialize([abi.calldata.encode(call), false]);
  // The RC2 read action sends transaction_hash_variant. This node implements
  // status and defaults to decided state if that field is absent.
  const result = await nodeRequest(endpoint, "gen_call", [
    { type: "read", to: address, from: zeroAddress, data, status: "finalized" },
  ]);
  if (result.status?.code !== 0 || typeof result.data !== "string" || !/^(?:0x)?(?:[0-9a-f]{2})+$/i.test(result.data)) {
    throw new Error("Bradbury finalized view did not execute successfully");
  }
  const bytes = hexToBytes(result.data.startsWith("0x") ? result.data : `0x${result.data}`);
  return abi.calldata.decode(bytes);
}
