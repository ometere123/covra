import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertDelegatedBeneficiary } from "../src/lib/quote";
import { canCancelUnanchoredClaim, sameClaimIntake } from "../src/lib/claim-intake";

const owner="0x1111111111111111111111111111111111111111";
const beneficiary="0x2222222222222222222222222222222222222222";
const claim={
  policyId:"0x"+"a".repeat(64),coverageClass:0,
  incidentAt:"2026-10-30T10:00:00.000Z",description:"A".repeat(90),
  evidenceUrls:["https://issuer.example.org/fact"],requestedMicroUsdc:"1000000",
  evidenceCommitment:"0x"+"c".repeat(64),
};
const existing={
  policy_id:claim.policyId,coverage_class:claim.coverageClass,incident_at:new Date(claim.incidentAt),
  description:claim.description,evidence_urls:claim.evidenceUrls,
  requested_micro_usdc:claim.requestedMicroUsdc,evidence_manifest_hash:claim.evidenceCommitment,
  status:"AWAITING_EVIDENCE",
};

describe("agent purchase and claim boundaries",()=>{
  it("allows delegated purchases only when their beneficiary is the insured",()=>{
    expect(()=>assertDelegatedBeneficiary(owner,owner.toUpperCase())).not.toThrow();
    expect(()=>assertDelegatedBeneficiary(owner,beneficiary)).toThrow(/Delegated purchases/);
  });

  it("treats a truly repeated claim as idempotent",()=>{
    expect(sameClaimIntake(existing,claim)).toBe(true);
    const draft = {...claim,evidenceUrls:[],evidenceCommitment:undefined};
    expect(sameClaimIntake(existing,draft)).toBe(true);
    expect(sameClaimIntake(existing,{...draft,description:"Changed incident details"})).toBe(false);
  });

  it("rejects reuse of an idempotency key for altered claims or cancelled intakes",()=>{
    expect(sameClaimIntake(existing,{...claim,requestedMicroUsdc:"999999"})).toBe(false);
    expect(sameClaimIntake(existing,{...claim,evidenceCommitment:"0x"+"b".repeat(64)})).toBe(false);
    expect(sameClaimIntake(existing,{...claim,policyId:"0x"+"e".repeat(64)})).toBe(false);
    expect(sameClaimIntake({...existing,status:"CANCELLED"},claim)).toBe(false);
  });

  it("restricts owner recovery to unanchored draft intakes",()=>{
    expect(canCancelUnanchoredClaim("AWAITING_EVIDENCE",null,null)).toBe(true);
    expect(canCancelUnanchoredClaim("INTAKE",null,null)).toBe(true);
    expect(canCancelUnanchoredClaim("DECIDED",null,null)).toBe(false);
    expect(canCancelUnanchoredClaim("AWAITING_EVIDENCE","0xabc",null)).toBe(false);
    expect(canCancelUnanchoredClaim("AWAITING_EVIDENCE",null,"0xabc")).toBe(false);
  });

  it("enforces the single active claim in the database, not just the API",()=>{
    const sql=readFileSync(join(process.cwd(),"supabase/migrations/005_claim_intake_integrity.sql"),"utf8");
    expect(sql).toMatch(/create unique index if not exists claims_one_active_per_policy_idx\s+on claims \(lower\(policy_id\)\) where status <> 'CANCELLED'/i);
  });

  it("does not allow old appeal receipts to roll back terminal claim statuses",()=>{
    const route=readFileSync(join(process.cwd(),"src/app/api/claims/chain-proof/route.ts"),"utf8");
    const protectedState="status in ('PAID','DENIED','EXPIRED','BRADBURY_FINALIZED','SETTLEMENT_PENDING')";
    expect(route.split(protectedState).length-1).toBeGreaterThanOrEqual(2);
    expect(route).toContain('claim.status === "CANCELLED"');
  });
});
