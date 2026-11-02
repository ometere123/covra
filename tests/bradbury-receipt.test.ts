import { describe, expect, it } from "vitest";
import { assertExactBradburyReceipt } from "@/lib/bradbury-receipt";

const txHash = `0x${"1".repeat(64)}`;
const adjudicator = `0x${"2".repeat(40)}`;
const claimId = `0x${"3".repeat(64)}`;

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    id: txHash,
    recipient: adjudicator,
    statusName: "FINALIZED",
    txExecutionResultName: "FINISHED_WITH_RETURN",
    txDataDecoded: {
      type: "call",
      callData: new Map<string, unknown>([
        ["", "adjudicate"],
        ["args", [claimId]],
      ]),
    },
    ...overrides,
  };
}

describe("exact Bradbury receipt verification", () => {
  it("accepts the exact finalized call and argument", () => {
    expect(() => assertExactBradburyReceipt({
      receipt: receipt(), transactionHash: txHash, recipient: adjudicator,
      functionName: "adjudicate", args: [claimId],
    })).not.toThrow();
  });

  it.each([
    ["wrong transaction id", { id: `0x${"4".repeat(64)}` }],
    ["wrong recipient", { recipient: `0x${"5".repeat(40)}` }],
    ["accepted status", { statusName: "ACCEPTED" }],
    ["wrong method", { txDataDecoded: { type: "call", callData: new Map<string, unknown>([["", "submit_case"], ["args", [claimId]]]) } }],
    ["wrong argument", { txDataDecoded: { type: "call", callData: new Map<string, unknown>([["", "adjudicate"], ["args", [`0x${"6".repeat(64)}`]]]) } }],
  ])("rejects %s", (_label, overrides) => {
    expect(() => assertExactBradburyReceipt({
      receipt: receipt(overrides), transactionHash: txHash, recipient: adjudicator,
      functionName: "adjudicate", args: [claimId],
    })).toThrow();
  });
});
