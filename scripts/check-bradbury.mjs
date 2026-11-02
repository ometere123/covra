const rpc = process.env.BRADBURY_CHAIN_RPC_URL || "https://rpc.testnet-chain.genlayer.com/";
async function requestRpc(method, params = [], endpoint = rpc) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} from RPC`);
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}
try {
  const chain = await requestRpc("eth_chainId");
  console.log("Bradbury Phase 2 EVM RPC:", rpc);
  console.log("eth_chainId response:", JSON.stringify(chain));
  if (parseInt(chain.result, 16) !== 4221) throw new Error("RPC is not Bradbury Phase 2 chain 4221");
  const genesis=await requestRpc("eth_getBlockByNumber",["0x0",false]);
  const expected=(process.env.BRADBURY_EXPECTED_GENESIS_HASH ||
    "0x17d89764d4f4f963158fc4c5e8f2cb670c2837740b35f37081c12860c3df97e4").toLowerCase();
  if (genesis.result?.hash?.toLowerCase()!==expected)
    throw new Error("Chain ID matches but genesis does not: stale or wrong Bradbury deployment");
  const manager=process.env.BRADBURY_ADDRESS_MANAGER||"0x3F71AE080BD6270A91dBcc7960d88797828538E0";
  const managerCode=await requestRpc("eth_getCode",[manager,"latest"]);
  if (!managerCode.result||managerCode.result==="0x")
    throw new Error("Bradbury Phase 2 AddressManager code was not found on the RPC");
  const feeManager=process.env.BRADBURY_FEE_MANAGER||"0x7678587A847712f2A96082AC07883A88D0fc7245";
  const feeManagerCode=await requestRpc("eth_getCode",[feeManager,"latest"]);
  if (!feeManagerCode.result||feeManagerCode.result==="0x")
    throw new Error("Bradbury Phase 2 FeeManager code was not found; do not use stale network metadata");
  console.log("Bradbury reset genesis, AddressManager and FeeManager verified:",expected,manager,feeManager);
  const node = process.env.BRADBURY_NODE_RPC_URL || "https://rpc-bradbury.genlayer.com";
  const absentTx="0x"+"00".repeat(32);
  const check = await requestRpc("gen_getTransactionReceipt",[{txId:absentTx}],node);
  if(check?.error?.code===-32601 || String(check?.error?.message||"").toLowerCase().includes("method not found"))
    throw new Error("Configured execution RPC lacks GenLayer gen_* calls");
  if (!check?.result || check.result.id?.toLowerCase() !== absentTx || check.result.statusName !== "Uninitialized")
    throw new Error("GenLayer node returned an unexpected receipt shape for the absent-transaction probe");
  console.log("GenLayer node-specific receipt method verified:",node,check.result.statusName);
} catch (error) {
  console.error("Bradbury smoke check failed:", error);
  process.exitCode = 1;
}
