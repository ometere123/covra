/** Read-only diagnostic for RC2's accountless FeeManager simulation. */
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const caller = process.argv[2];
if (!/^0x[0-9a-fA-F]{40}$/.test(caller || "")) throw new Error("Supply a funded public Bradbury caller address");
const endpoint = "https://rpc-bradbury.genlayer.com";
const originalFetch = globalThis.fetch;
let correctedCalls = 0;
globalThis.fetch = async (url, options) => {
  if (String(url) === endpoint && typeof options?.body === "string") {
    const body = JSON.parse(options.body);
    if (body.method === "eth_call" && body.params?.[0]?.to?.toLowerCase() === testnetBradbury.feeManagerContract.address.toLowerCase() && body.params[0].gasPrice && !body.params[0].from) {
      body.params[0].from = caller;
      correctedCalls++;
      options = { ...options, body: JSON.stringify(body) };
    }
  }
  return originalFetch(url, options);
};
try {
  const client = createClient({ chain: testnetBradbury, endpoint, account: caller });
  if (await client.getChainId() !== 4221) throw new Error("Wrong chain");
  const estimate = await client.estimateTransactionFees({});
  if (estimate.feeValue <= 0n) throw new Error("Zero protocol fee estimate");
  console.log(JSON.stringify({ caller, correctedCalls, estimate }, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2));
} finally {
  globalThis.fetch = originalFetch;
}
