/** Read-only coordinator: combine three or more independently produced signatures.
 * stdin: JSON array of attestor-sign records. stdout: verified settlement payload.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPublicClient,http,recoverTypedDataAddress } from "viem";
import { baseSepolia } from "viem/chains";
import { types,messageForSigning } from "./attestor-sign.mjs";
import { poolsAbi } from "../src/lib/chain.ts";

export async function aggregateAttestations(list, pool, base) {
  if (!Array.isArray(list)||list.length<3||list.length>5) throw new Error("Require 3-5 independently signed records");
  if (!/^0x[0-9a-fA-F]{40}$/.test(pool||"")) throw new Error("Pool address is required");
  const reference=JSON.stringify(list[0]?.decision);
  const message=messageForSigning(list[0].decision);
  const recovered=[];
  for (const record of list) {
    if (JSON.stringify(record.decision)!==reference) throw new Error("Attestors disagree on exact settlement decision");
    const signer=await recoverTypedDataAddress({
      domain:{name:"COVRA",version:"1",chainId:84532,verifyingContract:pool},
      types,primaryType:"Decision",message,signature:record.signature,
    });
    if (signer.toLowerCase()!==String(record.signer).toLowerCase()) throw new Error("Signature identity mismatch");
    recovered.push({signer,signature:record.signature});
  }
  recovered.sort((a,b)=>a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()));
  if (new Set(recovered.map(x=>x.signer.toLowerCase())).size!==recovered.length) throw new Error("Duplicate attestor");
  if (await base.getChainId()!==84532) throw new Error("Settlement RPC is not Base Sepolia");
  const signatures=recovered.map(x=>x.signature);
  // Simulating the exact calldata checks the frozen roster and whether the
  // claim, reserves, evidence revision and deadlines still permit settlement.
  await base.simulateContract({address:pool,abi:poolsAbi,functionName:"settle",
    args:[message,signatures],account:recovered[0].signer});
  return {decision:list[0].decision,signers:recovered.map(x=>x.signer),signatures};
}

async function main() {
  const list=JSON.parse(readFileSync(0,"utf8"));
  const base=createPublicClient({chain:baseSepolia,transport:http(process.env.BASE_RPC_URL||"https://sepolia.base.org")});
  const bundle=await aggregateAttestations(list,process.env.NEXT_PUBLIC_COVRA_POOLS_ADDRESS,base);
  process.stdout.write(JSON.stringify(bundle)+"\n");
}
if (process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error=>{console.error(error.shortMessage||error.message||String(error));process.exitCode=1;});
