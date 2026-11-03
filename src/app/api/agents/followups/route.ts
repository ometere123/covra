import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { walletSession } from "@/lib/auth";
import { authenticateAgent } from "@/lib/agent-auth";
import { database } from "@/lib/db";
import { responseError } from "@/lib/http";

export async function GET(request: NextRequest) {
  const wallet = await walletSession();
  const agent = wallet ? null : await authenticateAgent(request, "claim:read");
  const owner = wallet || agent?.ownerWallet;
  if (!owner) return NextResponse.json({ error: "Claim read authority required" }, { status: 401 });
  try {
    const sql = database();
    const rows = await sql`select j.claim_id,j.status,j.next_run_at,j.attempts,j.checkpoint,j.last_error,j.updated_at
      from claim_followups j join claims c on c.id=j.claim_id
      where lower(c.claimant_wallet)=${owner.toLowerCase()} order by j.updated_at desc limit 100`;
    return NextResponse.json({ items: rows, source: "durable_supabase_jobs", interval: "five-minute scheduler; hourly successful follow-up" });
  } catch (error) { return responseError(error); }
}

export async function POST(request: NextRequest) {
  const wallet = await walletSession();
  const agent = wallet ? null : await authenticateAgent(request, "claim:issue");
  const owner = wallet || agent?.ownerWallet;
  if (!owner) return NextResponse.json({ error: "Claim management authority required" }, { status: 401 });
  try {
    const { claimId } = z.object({ claimId: z.string().uuid() }).strict().parse(await request.json());
    const sql = database();
    const claims = await sql`select id,status from claims where id=${claimId} and lower(claimant_wallet)=${owner.toLowerCase()} limit 1`;
    if (!claims.length) return NextResponse.json({ error: "Owned claim not found" }, { status: 404 });
    if (["CANCELLED","PAID","DENIED","EXPIRED"].includes(String(claims[0].status))) return NextResponse.json({ error: "Claim is terminal" }, { status: 409 });
    const jobs = await sql`insert into claim_followups(claim_id,next_run_at) values(${claimId},now())
      on conflict(claim_id) do update set status='PENDING',attempts=0,next_run_at=now(),last_error=null,updated_at=now()
      where claim_followups.status='FAILED' and (claim_followups.lease_until is null or claim_followups.lease_until<now())
      returning claim_id,status`;
    return NextResponse.json({ claimId, scheduled: true, reset: jobs.length > 0,
      note: "Existing active jobs are preserved; no wallet or settlement authority granted." }, { status: 202 });
  } catch (error) { return responseError(error); }
}
