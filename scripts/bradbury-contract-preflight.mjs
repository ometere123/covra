import fs from "node:fs/promises";
import { createHash } from "node:crypto";

const sourcePath = process.argv[2] || "contracts/genlayer/BradburyPositiveControl.py";
const nodeRpc = process.env.BRADBURY_NODE_RPC_URL || "https://rpc-bradbury.genlayer.com";
let sourceBytes = 0;
let sourceSha256 = null;

async function request(method, params) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(nodeRpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: attempt + 1, method, params }),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

try {
  const sourceBuffer = await fs.readFile(sourcePath);
  const source = sourceBuffer.toString("utf8");
  sourceBytes = sourceBuffer.byteLength;
  sourceSha256 = createHash("sha256").update(sourceBuffer).digest("hex");
  const chain = await request("eth_chainId", []);
  const chainId = Number.parseInt(chain.result, 16);
  if (chainId !== 4221) {
    throw new Error(`execution RPC is not Bradbury Phase 2: chainId=${chain.result}`);
  }

  const schema = await request("gen_getContractSchema", [{
    code: Buffer.from(source, "utf8").toString("base64"),
  }]);
  if (schema.error) {
    throw new Error(`GenVM rejected ${sourcePath}: ${schema.error.code} ${schema.error.message}`);
  }
  if (!schema.result?.ctor || !schema.result?.methods) {
    throw new Error("GenVM returned an incomplete contract schema");
  }

  console.log(JSON.stringify({
    ok: true,
    sourcePath,
    sourceBytes,
    sourceSha256,
    nodeRpc,
    chainId,
    constructor: schema.result.ctor,
    methods: Object.keys(schema.result.methods),
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    sourcePath,
    sourceBytes,
    sourceSha256,
    nodeRpc,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
}
