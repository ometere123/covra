import { sleep } from "workflow";

async function inspectClaim(claimId: string) {
  "use step";
  const { database } = await import("@/lib/db");
  const sql = database();
  const rows = await sql`select status,created_at from claims where id=${claimId}`;
  console.info("[COVRA] Claim follow-up", { claimId, status: rows[0]?.status || "MISSING" });
  return rows.length ? String(rows[0].status) : "MISSING";
}

export async function claimEvidenceFollowup(claimId: string) {
  "use workflow";
  console.info("[COVRA] Starting durable claim follow-up", { claimId });
  await sleep("1h");
  const status = await inspectClaim(claimId);
  // Nothing is approved by an offchain worker. All outcomes require GenLayer
  // finality, independent attestors and execution by the Base settlement vault.
  return { claimId, status, requiresHumanOrAgentAction: status === "AWAITING_EVIDENCE" };
}
