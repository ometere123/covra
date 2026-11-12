import { describe, expect, it } from "vitest";
import { BRADBURY_APPEAL_WINDOW_SECONDS, finalizationReadiness } from "@/lib/finalization-window";

const decidedAt = 1_794_390_077;

describe("Bradbury case finalization gate", () => {
  it("keeps a successfully adjudicated transaction inside the appeal window", () => {
    const result = finalizationReadiness({ state: "DECIDED", decided_at: decidedAt, appeal_used: false }, decidedAt + BRADBURY_APPEAL_WINDOW_SECONDS - 1);
    expect(result.ready).toBe(false);
    expect(result.reason).toContain("do not submit finalize_case");
    expect(result.earliestFinalizationAt).toBe(decidedAt + BRADBURY_APPEAL_WINDOW_SECONDS);
  });

  it("allows the exact boundary only after a fresh DECIDED read", () => {
    const result = finalizationReadiness({ state: "DECIDED", decided_at: String(decidedAt), appeal_used: false }, decidedAt + BRADBURY_APPEAL_WINDOW_SECONDS);
    expect(result.ready).toBe(true);
  });

  it("fails closed for an appeal, finalized case, or malformed state", () => {
    expect(finalizationReadiness({ state: "FINALIZED", decided_at: decidedAt }, decidedAt + 999999).reason).toContain("already finalized");
    expect(finalizationReadiness({ state: "DECIDED", decided_at: decidedAt }, decidedAt + BRADBURY_APPEAL_WINDOW_SECONDS - 1).ready).toBe(false);
    expect(finalizationReadiness({ state: "SUBMITTED", decided_at: decidedAt }, decidedAt + 999999).ready).toBe(false);
    expect(finalizationReadiness({ state: "DECIDED", decided_at: 0 }, decidedAt + 999999).ready).toBe(false);
  });
});
