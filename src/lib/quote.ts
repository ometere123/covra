import { z } from "zod";
import { coverageById } from "./catalog";
import { riskSpecSchema } from "./risk-spec";

export const quoteRequestSchema = z.object({
  coverageClass: z.number().int().min(0).max(4),
  coverageUsd: z.number().min(100).max(250000),
  durationDays: z.number().int().min(1).max(365),
  insured: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  beneficiary: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  termsHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  riskSpec: riskSpecSchema,
}).superRefine((q,ctx)=>{
  if (q.coverageClass !== q.riskSpec.coverageClass) {
    ctx.addIssue({code:"custom",path:["riskSpec","coverageClass"],message:"Insured risk class mismatch"});
  }
});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

/** An API credential is not permission to redirect somebody else's coverage. */
export function assertDelegatedBeneficiary(insured: string, beneficiary: string) {
  if (insured.toLowerCase() !== beneficiary.toLowerCase()) {
    throw new Error("Delegated purchases must pay the insured wallet; only the owner can select a different beneficiary");
  }
}

export function calculateTestnetQuote(payload: Pick<QuoteRequest,"coverageClass"|"coverageUsd"|"durationDays">) {
  const risk = coverageById(payload.coverageClass);
  if (payload.durationDays > risk.maxDurationDays) {
    throw new Error("Duration exceeds the configured limit for this coverage");
  }
  // Deterministic testnet protocol configuration only. Not actuarial pricing
  // or an insurance offer; the API and UI disclose this to the user.
  const cents = Math.round(payload.coverageUsd * 100);
  const annualized = Math.ceil((cents * risk.testRateBps * payload.durationDays) / (365 * 10_000));
  const feeCents = Math.max(100, annualized);
  return {
    classId: risk.id,
    coverLimitMicroUsdc: BigInt(cents) * 10_000n,
    premiumMicroUsdc: BigInt(feeCents) * 10_000n,
    premiumUsd: feeCents / 100,
    coverageUsd: payload.coverageUsd,
    durationDays: payload.durationDays,
    methodology: "deterministic-testnet-rate",
  };
}

export const claimInputSchema = z.object({
  policyId: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  coverageClass: z.number().int().min(0).max(4),
  incidentAt: z.string().datetime(),
  description: z.string().min(80).max(4000),
  evidenceUrls: z.array(z.string().url()).min(1).max(8),
  requestedMicroUsdc: z.string().regex(/^[1-9][0-9]*$/),
  evidenceCommitment: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

