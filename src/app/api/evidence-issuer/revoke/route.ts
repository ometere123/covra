import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { database } from "@/lib/db";
import { responseError, testnetGuard } from "@/lib/http";

export const runtime = "nodejs";

const schema = z.object({
  observationId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/),
  state: z.enum(["REVOKED", "SUPERSEDED"]),
  supersededBy: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/).optional(),
}).strict().superRefine((value, context) => {
  if (value.state === "SUPERSEDED" && !value.supersededBy) {
    context.addIssue({ code: "custom", path: ["supersededBy"], message: "Supersession requires a replacement observation" });
  }
  if (value.supersededBy && value.supersededBy === value.observationId) {
    context.addIssue({ code: "custom", path: ["supersededBy"], message: "An observation cannot supersede itself" });
  }
});

function authorized(request: NextRequest): boolean {
  const expected = process.env.EVIDENCE_ISSUER_ADMIN_TOKEN;
  const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied || expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  try {
    testnetGuard();
    if (!authorized(request)) return NextResponse.json({ error: "Evidence issuer authorization required" }, { status: 401 });
    const body = schema.parse(await request.json());
    const sql = database();
    if (body.state === "SUPERSEDED") {
      const replacements = await sql`select envelope,state,expires_at from evidence_issuer_observations
        where observation_id=${body.supersededBy!} limit 1`;
      const replacement = replacements[0];
      const originalRows = await sql`select envelope from evidence_issuer_observations
        where observation_id=${body.observationId} and state='ACTIVE' limit 1`;
      const original = originalRows[0];
      const originalEnvelope = original?.envelope as { policy_id?: string; claim_id?: string; risk_spec_hash?: string } | undefined;
      const replacementEnvelope = replacement?.envelope as { policy_id?: string; claim_id?: string; risk_spec_hash?: string } | undefined;
      if (!replacement || replacement.state !== "ACTIVE" || new Date(String(replacement.expires_at)).getTime() <= Date.now() ||
          !originalEnvelope || !replacementEnvelope ||
          originalEnvelope.policy_id?.toLowerCase() !== replacementEnvelope.policy_id?.toLowerCase() ||
          originalEnvelope.claim_id?.toLowerCase() !== replacementEnvelope.claim_id?.toLowerCase() ||
          originalEnvelope.risk_spec_hash?.toLowerCase() !== replacementEnvelope.risk_spec_hash?.toLowerCase()) {
        throw new Error("Replacement observation must be active, unexpired and bound to the same claim and frozen risk");
      }
    }
    const rows = await sql`update evidence_issuer_observations set state=${body.state},
      supersedes_observation_id=${body.state === "SUPERSEDED" ? body.supersededBy! : null},revoked_at=now()
      where observation_id=${body.observationId} and state='ACTIVE' returning observation_id,state`;
    if (!rows.length) return NextResponse.json({ error: "Active observation not found or already revoked" }, { status: 404 });
    return NextResponse.json({ revoked: true, observationId: body.observationId, state: body.state });
  } catch (error) {
    return responseError(error);
  }
}
