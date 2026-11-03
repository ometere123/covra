import { randomUUID } from "node:crypto";
import { database } from "@/lib/db";

/** Read-model monitoring only. A job never signs, approves or moves funds. */
export function claimEvidenceFollowup(status: string) {
  const terminal = ["MISSING", "CANCELLED", "PAID", "DENIED", "EXPIRED"].includes(status);
  const action = terminal ? "NONE" :
    ["INTAKE", "AWAITING_EVIDENCE"].includes(status) ? "SUPPLY_AND_VERIFY_EVIDENCE" :
    status === "APPEAL_SYNC_PENDING" ? "RECOVER_APPEAL_RECEIPTS_AND_BASE_REVISION" :
    status === "BRADBURY_FINALIZED" ? "OBTAIN_INDEPENDENT_ATTESTOR_AUTHORIZATION" :
    status === "SETTLEMENT_PENDING" ? "RECOVER_AND_VERIFY_BASE_RECEIPT" :
    "VERIFY_BRADBURY_PROGRESS_AND_APPEAL_WINDOW";
  return { observedStatus: status, terminal, requiredAction: action,
    source: "reconciled_operational_read_model", payoutAuthorized: false };
}

/** One bounded batch per Cron invocation; expired leases recover after crashes. */
export async function processClaimFollowups() {
  const sql = database();
  const lease = randomUUID();
  await sql`update claim_followups set status='FAILED',last_error='LEASE_RETRY_LIMIT',updated_at=now()
    where status='RUNNING' and lease_until<now() and attempts>=5`;
  const jobs = await sql`with due as (
      select claim_id from claim_followups
      where status in ('PENDING','WAITING','RUNNING') and next_run_at<=now()
        and (lease_until is null or lease_until<now()) and attempts<5
      order by next_run_at for update skip locked limit 10
    ) update claim_followups j set status='RUNNING',lease_id=${lease},attempts=j.attempts+1,
      lease_until=now()+interval '4 minutes',updated_at=now()
    from due where j.claim_id=due.claim_id returning j.claim_id`;
  let completed = 0, waiting = 0, failed = 0;
  for (const job of jobs) {
    try {
      const claims = await sql`select status from claims where id=${job.claim_id} limit 1`;
      const checkpoint = claimEvidenceFollowup(claims.length ? String(claims[0].status) : "MISSING");
      const updated = await sql`update claim_followups set
        status=${checkpoint.terminal ? "COMPLETED" : "WAITING"},
        checkpoint=${sql.json(checkpoint)},next_run_at=now()+interval '1 hour',
        attempts=0,last_error=null,lease_id=null,lease_until=null,updated_at=now()
        where claim_id=${job.claim_id} and lease_id=${lease} and lease_until>now() returning claim_id`;
      if (updated.length) { if (checkpoint.terminal) completed++; else waiting++; }
    } catch {
      failed++;
      await sql`update claim_followups set
        status=case when attempts>=5 then 'FAILED' else 'WAITING' end,
        next_run_at=now()+(attempts*interval '5 minutes'),
        last_error='FOLLOWUP_CHECK_FAILED',lease_id=null,lease_until=null,updated_at=now()
        where claim_id=${job.claim_id} and lease_id=${lease} and lease_until>now()`.catch(() => undefined);
    }
  }
  console.info("[COVRA] bounded claim follow-up batch", { checked: jobs.length, completed, waiting, failed });
  return { checked: jobs.length, completed, waiting, failed };
}
