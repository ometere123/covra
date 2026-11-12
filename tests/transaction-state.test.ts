import { describe, expect, it } from "vitest";
import { transactionPhaseLabel, transactionPhaseTone } from "../src/lib/transaction-state";

describe("transaction state presentation", () => {
  it("keeps wallet, submission, confirmation and terminal states distinct", () => {
    expect(transactionPhaseLabel.AWAITING_SIGNATURE).toMatch(/wallet/i);
    expect(transactionPhaseLabel.SUBMITTED).toBe("Submitted");
    expect(transactionPhaseLabel.CONFIRMING).toMatch(/confirmation/i);
    expect(transactionPhaseLabel.CONFIRMED).toBe("Confirmed");
    expect(transactionPhaseTone("CONFIRMED")).toBe("success");
    expect(transactionPhaseTone("REVERTED")).toBe("error");
  });
});
