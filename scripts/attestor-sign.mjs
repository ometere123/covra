/** ONE independent operator signs only after its own issuer/finality review.
 * stdin: JSON output from attestor-preflight. stdout: one signature record.
 * The five operators MUST use separately controlled keys and nodes.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname,resolve } from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient,http,parseAbi } from "viem";
import { baseSepolia } from "viem/chains";
import { parsePreflightOutput } from "./preflight-io.mjs";

export const types={Decision:[
  {name:"policyId",type:"bytes32"},{name:"claimId",type:"bytes32"},
  {name:"bradburyDecisionId",type:"bytes32"},{name:"genlayerTxId",type:"bytes32"},
  {name:"evidenceDigest",type:"bytes32"},{name:"resultDigest",type:"bytes32"},
  {name:"termsHash",type:"bytes32"},{name:"riskSpecHash",type:"bytes32"},
  {name:"recipient",type:"address"},{name:"amount",type:"uint96"},
  {name:"coverageClass",type:"uint8"},{name:"verdict",type:"uint8"},
  {name:"revision",type:"uint8"},{name:"finalizedAt",type:"uint64"},
  {name:"deadline",type:"uint64"},{name:"sourceChainId",type:"uint256"},
  {name:"adjudicator",type:"address"},
]};
export function messageForSigning(value) {
  return {...value,amount:BigInt(value.amount),finalizedAt:BigInt(value.finalizedAt),
    deadline:BigInt(value.deadline),sourceChainId:BigInt(value.sourceChainId)};
}

async function main() {
  const secret=process.env.ATTESTOR_PRIVATE_KEY;
  if (!/^0x[0-9a-fA-F]{64}$/.test(secret||"")) throw new Error("One isolated ATTESTOR_PRIVATE_KEY required");
  if (process.env.ATTESTOR_MANUAL_APPROVAL!=="I_INDEPENDENTLY_VERIFIED_THIS_CASE")
    throw new Error("Independent issuer/finality verification and explicit manual approval required");
  const input=JSON.parse(readFileSync(0,"utf8"));
  if (input.status!=="SOURCE_CHECKS_PASSED_NOT_SIGNABLE"||!input.decision)
    throw new Error("The verified preflight output is required");
  // Never sign merely because someone supplied JSON claiming a successful
  // preflight. Re-run independently against this operator's configured nodes.
  const preflight=parsePreflightOutput(execFileSync(process.execPath,[
    "--experimental-strip-types",
    resolve(dirname(fileURLToPath(import.meta.url)),"attestor-preflight.mjs"),
    input.caseId,input.decision.genlayerTxId,
  ],{encoding:"utf8",timeout:60000,env:process.env,maxBuffer:1024*1024}));
  if (JSON.stringify(preflight.decision)!==JSON.stringify(input.decision))
    throw new Error("Independent preflight disagrees on the signable statement");
  const pool=process.env.NEXT_PUBLIC_COVRA_POOLS_ADDRESS;
  if (!/^0x[0-9a-fA-F]{40}$/.test(pool||"")) throw new Error("Invalid pool address");
  const account=privateKeyToAccount(secret);
  const base=createPublicClient({chain:baseSepolia,transport:http(process.env.BASE_RPC_URL||"https://sepolia.base.org")});
  const isAttestor=await base.readContract({address:pool,abi:parseAbi(["function attestorForClaim(bytes32 claimId,address signer) view returns(bool)"]),functionName:"attestorForClaim",args:[input.decision.claimId,account.address]});
  if (!isAttestor) throw new Error("Signer not registered on Base pool contract");
  const message=messageForSigning(input.decision);
  if (message.deadline<=BigInt(Math.floor(Date.now()/1000))) throw new Error("Settlement certificate deadline passed");
  const signature=await account.signTypedData({
    domain:{name:"COVRA",version:"1",chainId:84532,verifyingContract:pool},
    types,primaryType:"Decision",message,
  });
  process.stdout.write(JSON.stringify({signer:account.address,signature,decision:input.decision})+"\n");
}
if (process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(e=>{console.error(e.message||String(e));process.exitCode=1;});
