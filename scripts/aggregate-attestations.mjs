/** Offline coordinator: combine three or more independently produced signatures.
 * stdin: JSON array of attestor-sign records. stdout: verified settlement payload.
 */
import { readFileSync } from "node:fs";
import { createPublicClient,http,parseAbi,recoverTypedDataAddress } from "viem";
import { baseSepolia } from "viem/chains";
import { types,messageForSigning } from "./attestor-sign.mjs";

async function main() {
  const list=JSON.parse(readFileSync(0,"utf8"));
  if (!Array.isArray(list)||list.length<3||list.length>5) throw new Error("Require 3-5 independently signed records");
  const pool=process.env.NEXT_PUBLIC_COVRA_POOLS_ADDRESS;
  if (!/^0x[0-9a-fA-F]{40}$/.test(pool||"")) throw new Error("Pool address is required");
  const reference=JSON.stringify(list[0]?.decision);
  const recovered=[];
  for (const record of list) {
    if (JSON.stringify(record.decision)!==reference) throw new Error("Attestors disagree on exact settlement decision");
    const signer=await recoverTypedDataAddress({
      domain:{name:"COVRA",version:"1",chainId:84532,verifyingContract:pool},
      types,primaryType:"Decision",message:messageForSigning(record.decision),signature:record.signature,
    });
    if (signer.toLowerCase()!==String(record.signer).toLowerCase()) throw new Error("Signature identity mismatch");
    recovered.push({signer,signature:record.signature});
  }
  recovered.sort((a,b)=>a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()));
  if (new Set(recovered.map(x=>x.signer.toLowerCase())).size!==recovered.length) throw new Error("Duplicate attestor");
  const base=createPublicClient({chain:baseSepolia,transport:http(process.env.BASE_RPC_URL||"https://sepolia.base.org")});
  const abi=parseAbi(["function attestorForClaim(bytes32 claimId,address signer) view returns(bool)"]);
  const enabled=await Promise.all(recovered.map(x=>base.readContract({
    address:pool,abi,functionName:"attestorForClaim",args:[list[0].decision.claimId,x.signer],
  })));
  if (enabled.some(value=>!value)) throw new Error("An attestation signer is not currently authorized by Base pool");
  process.stdout.write(JSON.stringify({decision:list[0].decision,signers:recovered.map(x=>x.signer),
    signatures:recovered.map(x=>x.signature)})+"\n");
}
main().catch(error=>{console.error(error.message||String(error));process.exitCode=1;});
