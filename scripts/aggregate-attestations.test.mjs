import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { aggregateAttestations } from "./aggregate-attestations.mjs";
import { types, messageForSigning } from "./attestor-sign.mjs";

// Isolated signing fixtures. These identities have no deployed authority.
const pool=`0x${"aa".repeat(20)}`;
const hash=`0x${"22".repeat(32)}`;
const decision={policyId:hash,claimId:hash,bradburyDecisionId:hash,genlayerTxId:hash,evidenceDigest:hash,
  resultDigest:hash,termsHash:hash,riskSpecHash:hash,recipient:pool,amount:"1",coverageClass:0,
  verdict:1,revision:0,finalizedAt:"1",deadline:"2",sourceChainId:"4221",adjudicator:pool};
const domain={name:"COVRA",version:"1",chainId:84532,verifyingContract:pool};
const records=await Promise.all([3,2,1].map(async (id)=>{
  const account=privateKeyToAccount(`0x${id.toString(16).padStart(64,"0")}`);
  const signature=await account.signTypedData({domain,types,primaryType:"Decision",message:messageForSigning(decision)});
  return {decision,signature,signer:account.address};
}));

test("emits only the sorted signature set accepted by exact Base simulation", async ()=>{
  let calls=0;
  const bundle=await aggregateAttestations(records,pool,{
    getChainId:async()=>84532,
    simulateContract:async({address,args,functionName})=>{
      calls++;
      assert.equal(address,pool);
      assert.equal(functionName,"settle");
      assert.deepEqual(args[0],messageForSigning(decision));
      assert.deepEqual(args[1],records.toSorted((a,b)=>a.signer.toLowerCase().localeCompare(b.signer.toLowerCase())).map(r=>r.signature));
    },
  });
  assert.equal(calls,1);
  assert.equal(bundle.signatures.length,3);
});

test("rejects duplicate signers, another chain and a reverted settlement", async ()=>{
  await assert.rejects(aggregateAttestations([records[0],records[0],records[1]],pool,{}),/Duplicate/);
  await assert.rejects(aggregateAttestations(records,pool,{getChainId:async()=>8453}),/Base Sepolia/);
  await assert.rejects(aggregateAttestations(records,pool,{getChainId:async()=>84532,
    simulateContract:async()=>{throw new Error("Stale or already settled claim");}}),/Stale/);
});
