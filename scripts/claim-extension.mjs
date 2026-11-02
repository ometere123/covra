/** Claim-reserve grace extension, never a payment authorization.
 * Each attestor: `node .../claim-extension.mjs sign < policy-and-deadline.json`
 * Coordinator: `node .../claim-extension.mjs aggregate < signatures.json`
 * Independent signers may extend an existing locked claim by at most 30 days
 * at a time, never more than 60 days beyond the ordinary 45-day grace.
 */
import { readFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, parseAbi, recoverTypedDataAddress } from "viem";
import { baseSepolia } from "viem/chains";

const types={ClaimExtension:[
  {name:"policyId",type:"bytes32"},{name:"claimId",type:"bytes32"},
  {name:"previousDeadline",type:"uint64"},{name:"newDeadline",type:"uint64"},
]};
const abi=parseAbi([
  "function policies(bytes32) view returns (address,address,uint8,uint8,uint96,uint64,uint64,uint64,bytes32,bytes32)",
  "function claimLockOf(bytes32) view returns (bytes32,bytes32,uint64,uint8,uint256)",
  "function claimResolutionDeadline(bytes32) view returns(uint256)",
  "function attestorForClaim(bytes32,address) view returns(bool)",
]);
const pool=process.env.NEXT_PUBLIC_COVRA_POOLS_ADDRESS;
if (!/^0x[0-9a-fA-F]{40}$/.test(pool||"")) throw new Error("Exact deployed Base pool required");
const base=createPublicClient({chain:baseSepolia,transport:http(process.env.BASE_RPC_URL||"https://sepolia.base.org")});
const domain={name:"COVRA",version:"1",chainId:84532,verifyingContract:pool};
function bytes32(x){return /^0x[a-f0-9]{64}$/i.test(x||"");}
function parseMessage(raw){
  const {policyId,claimId,previousDeadline,newDeadline}=raw;
  if (!bytes32(policyId)||!bytes32(claimId)||!Number.isSafeInteger(Number(previousDeadline))||
      !Number.isSafeInteger(Number(newDeadline))) throw new Error("Malformed claim extension");
  return {policyId,claimId,previousDeadline:BigInt(previousDeadline),newDeadline:BigInt(newDeadline)};
}
async function checkExtension(message){
  if(await base.getChainId()!==84532) throw new Error("Wrong Base chain");
  const [p,locked,deadline]=await Promise.all([
    base.readContract({address:pool,abi,functionName:"policies",args:[message.policyId]}),
    base.readContract({address:pool,abi,functionName:"claimLockOf",args:[message.policyId]}),
    base.readContract({address:pool,abi,functionName:"claimResolutionDeadline",args:[message.policyId]}),
  ]);
  const now=BigInt(Math.floor(Date.now()/1000));
  if (p[3]!==1||locked[0].toLowerCase()!==message.claimId.toLowerCase()||
      deadline!==message.previousDeadline||now>deadline||message.newDeadline<=deadline||
      message.newDeadline>deadline+30n*86400n||
      message.newDeadline>BigInt(p[7])+105n*86400n)
    throw new Error("Claim extension violates current onchain lock, deadline or 105-day limit");
}
async function main(){
  const input=JSON.parse(readFileSync(0,"utf8"));
  const mode=process.argv[2];
  if(mode==="sign"){
    if(process.env.ATTESTOR_MANUAL_APPROVAL!=="I_INDEPENDENTLY_VERIFIED_THIS_CASE")
      throw new Error("Independent verification/manual approval required");
    if(!/^0x[0-9a-fA-F]{64}$/.test(process.env.ATTESTOR_PRIVATE_KEY||""))
      throw new Error("An isolated attestor private key is required");
    const account=privateKeyToAccount(process.env.ATTESTOR_PRIVATE_KEY);
    const message=parseMessage(input);
    await checkExtension(message);
    if(!await base.readContract({address:pool,abi,functionName:"attestorForClaim",args:[message.claimId,account.address]}))
      throw new Error("Signer is not an enabled attestor");
    const signature=await account.signTypedData({domain,types,primaryType:"ClaimExtension",message});
    process.stdout.write(JSON.stringify({signer:account.address,signature,message:input})+"\n");
    return;
  }
  if(mode==="aggregate"){
    if(!Array.isArray(input)||input.length<3||input.length>5)throw new Error("Require 3–5 distinct attestors");
    const original=JSON.stringify(input[0].message);
    const message=parseMessage(input[0].message);
    await checkExtension(message);
    const records=[];
    for(const item of input){
      if(JSON.stringify(item.message)!==original)throw new Error("Extension payload differs among operators");
      const recovered=await recoverTypedDataAddress({domain,types,primaryType:"ClaimExtension",message,signature:item.signature});
      if(recovered.toLowerCase()!==String(item.signer).toLowerCase())throw new Error("Signer identity mismatch");
      if(!await base.readContract({address:pool,abi,functionName:"attestorForClaim",args:[message.claimId,recovered]}))
        throw new Error("Attestor no longer authorized");
      records.push({signer:recovered,signature:item.signature});
    }
    records.sort((a,b)=>a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()));
    if(new Set(records.map(r=>r.signer.toLowerCase())).size!==records.length)
      throw new Error("Repeated signer");
    process.stdout.write(JSON.stringify({policyId:message.policyId,newDeadline:message.newDeadline.toString(),
      signatures:records.map(r=>r.signature),functionName:"extendClaimResolution"})+"\n");
    return;
  }
  throw new Error("Expected sign or aggregate mode");
}
main().catch(error=>{console.error(error.message||String(error));process.exitCode=1;});
