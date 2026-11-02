import { describe, expect, it } from "vitest";
import { planAppealRecovery } from "../src/lib/appeal-recovery";

const a="0x"+"a".repeat(64);
const b="0x"+"b".repeat(64);
const baseline={
  baseRevision:0,baseDigest:a,bradburyRevision:0,bradburyDigest:a,
  bradburyState:"DECIDED",desiredDigest:b,
};

describe("non-atomic cross-chain appeal recovery",()=>{
  it("starts with Bradbury while its shorter appeal window is open",()=>{
    expect(planAppealRecovery(baseline)).toBe("APPEAL_BRADBURY_AND_REVISE_BASE");
  });
  it("does not repeat an already consumed Base revision",()=>{
    expect(planAppealRecovery({...baseline,baseRevision:1,baseDigest:b}))
      .toBe("SUBMIT_BRADBURY_ONLY");
  });
  it("can catch up Base after Bradbury already recorded the appeal",()=>{
    expect(planAppealRecovery({...baseline,bradburyRevision:1,bradburyDigest:b,bradburyState:"SUBMITTED"}))
      .toBe("REVISE_BASE_ONLY");
  });
  it("recognizes matched evidence on both networks",()=>{
    expect(planAppealRecovery({...baseline,baseRevision:1,baseDigest:b,
      bradburyRevision:1,bradburyDigest:b,bradburyState:"DECIDED"}))
      .toBe("ALREADY_SYNCHRONIZED");
  });
  it("fails closed for mismatched digests, consumed revisions and premature cases",()=>{
    expect(()=>planAppealRecovery({...baseline,baseRevision:1})).toThrow(/different evidence/);
    expect(()=>planAppealRecovery({...baseline,bradburyRevision:1,bradburyState:"SUBMITTED"}))
      .toThrow(/different evidence/);
    expect(()=>planAppealRecovery({...baseline,bradburyState:"FINALIZED"})).toThrow(/not in/);
    expect(()=>planAppealRecovery({...baseline,baseRevision:2})).toThrow(/Unsupported/);
  });
});
