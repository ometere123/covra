import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ sql: undefined as any, claimStatus: "AWAITING_EVIDENCE", failRead: false,
  leaseLost: false, completed: false, checkpoint: null as any, failed: false }));
vi.mock("../src/lib/db", () => ({ database: () => state.sql }));
import { claimEvidenceFollowup, processClaimFollowups } from "../src/workflows/claim-followup";
beforeEach(() => {
  state.claimStatus = "AWAITING_EVIDENCE"; state.failRead = false; state.leaseLost = false;
  state.completed = false; state.checkpoint = null; state.failed = false;
  const sql: any = async (parts: TemplateStringsArray, ...values: any[]) => {
    const text = parts.join(" ? ").replace(/\s+/g, " ").trim();
    if (text.includes("LEASE_RETRY_LIMIT")) return [];
    if (text.startsWith("with due")) return [{ claim_id: "test-only-claim" }];
    if (text.startsWith("select status")) { if (state.failRead) throw new Error("Injected database outage"); return [{ status: state.claimStatus }]; }
    if (text.includes("FOLLOWUP_CHECK_FAILED")) { state.failed = true; return []; }
    if (text.startsWith("update claim_followups set")) {
      if (state.leaseLost) return [];
      state.completed = values[0] === "COMPLETED"; state.checkpoint = values[1]; return [{ claim_id: "test-only-claim" }];
    }
    throw new Error("Unexpected follow-up query");
  };
  sql.json = (value: unknown) => value; state.sql = sql;
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
it("persists the next required action without creating settlement authority", async () => {
  expect(await processClaimFollowups()).toMatchObject({ checked: 1, waiting: 1, failed: 0 });
  expect(state.checkpoint).toMatchObject({ requiredAction: "SUPPLY_AND_VERIFY_EVIDENCE", payoutAuthorized: false });
});
it("requires recovery during interrupted appeals and settles no claim on a timer", () => {
  expect(claimEvidenceFollowup("APPEAL_SYNC_PENDING").requiredAction).toBe("RECOVER_APPEAL_RECEIPTS_AND_BASE_REVISION");
  for (const status of ["AWAITING_EVIDENCE", "ADJUDICATING", "DECIDED", "BRADBURY_FINALIZED", "SETTLEMENT_PENDING"]) {
    expect(claimEvidenceFollowup(status)).toMatchObject({ terminal: false, payoutAuthorized: false });
  }
});
it("stops monitoring terminal chain-derived statuses", async () => {
  state.claimStatus = "PAID";
  expect(await processClaimFollowups()).toMatchObject({ completed: 1, waiting: 0 });
  expect(state.completed).toBe(true);
  expect(state.checkpoint).toMatchObject({ requiredAction: "NONE", payoutAuthorized: false });
});
it("records a bounded retry after failures instead of reporting completed work", async () => {
  state.failRead = true;
  expect(await processClaimFollowups()).toMatchObject({ completed: 0, failed: 1 });
  expect(state.failed).toBe(true); expect(state.checkpoint).toBeNull();
});
it("cannot persist a checkpoint after lease ownership was lost", async () => {
  state.leaseLost = true;
  expect(await processClaimFollowups()).toMatchObject({ completed: 0, waiting: 0 });
  expect(state.checkpoint).toBeNull();
});
