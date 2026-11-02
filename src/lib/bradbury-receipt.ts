/**
 * Fail-closed verification for a finalized Bradbury transaction.
 *
 * The GenLayer SDK exposes decoded calldata as a Map. This helper compares the
 * decoded method and every argument structurally; it deliberately does not use
 * string inclusion because a wrong claim or method can otherwise look valid.
 */

type UnknownRecord = Record<string, unknown>;

export type BradburyReceiptExpectation = {
  receipt: unknown;
  transactionHash: string;
  recipient: string;
  functionName: string;
  args: readonly unknown[];
};

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function mapValue(value: unknown, key: string): unknown {
  if (value instanceof Map) return value.get(key);
  const object = record(value);
  return object ? object[key] : undefined;
}

function hexBytes(value: Uint8Array): string {
  return `0x${Array.from(value, byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

function comparable(value: unknown): unknown {
  if (typeof value === "bigint") return { type: "number", value: value.toString(10) };
  if (typeof value === "number" && Number.isFinite(value)) {
    return { type: "number", value: String(value) };
  }
  if (typeof value === "string") {
    if (/^0x[0-9a-fA-F]+$/.test(value)) return { type: "hex", value: value.toLowerCase() };
    return { type: "string", value };
  }
  if (value instanceof Uint8Array) return { type: "hex", value: hexBytes(value) };
  if (Array.isArray(value)) return value.map(comparable);
  if (value instanceof Map) {
    return Array.from(value.entries())
      .map(([key, entry]) => [String(key), comparable(entry)])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  }
  const object = record(value);
  if (object) {
    return Object.keys(object).sort().map(key => [key, comparable(object[key])]);
  }
  return value;
}

function exactEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

function normalizedStatus(value: unknown): string {
  return String(value ?? "").replaceAll("_", "").replaceAll("-", "").toUpperCase();
}

function exactTransactionId(receipt: UnknownRecord, transactionHash: string): void {
  const candidates = [receipt.id, receipt.txId, receipt.hash].filter(value => value !== undefined && value !== null);
  if (!candidates.length || candidates.some(value => String(value).toLowerCase() !== transactionHash.toLowerCase())) {
    throw new Error("Bradbury receipt identifier does not exactly match the submitted transaction");
  }
}

export function assertExactBradburyReceipt(expectation: BradburyReceiptExpectation): UnknownRecord {
  const receipt = record(expectation.receipt);
  if (!receipt) throw new Error("Malformed Bradbury receipt");
  exactTransactionId(receipt, expectation.transactionHash);

  const status = receipt.statusName ?? receipt.status;
  if ((typeof status === "number" && status !== 7) ||
      (typeof status !== "number" && normalizedStatus(status) !== "FINALIZED")) {
    throw new Error("Bradbury receipt is not finalized");
  }
  const execution = receipt.txExecutionResultName ?? receipt.txExecutionResult;
  if ((typeof execution === "number" && execution !== 1) ||
      (typeof execution !== "number" && normalizedStatus(execution) !== "FINISHEDWITHRETURN")) {
    throw new Error("Bradbury transaction did not finish with a return value");
  }

  const destination = receipt.recipient ?? receipt.to_address;
  if (typeof destination !== "string" || destination.toLowerCase() !== expectation.recipient.toLowerCase()) {
    throw new Error("Bradbury receipt recipient does not match the configured adjudicator");
  }

  const decoded = record(receipt.txDataDecoded);
  if (!decoded || decoded.type !== "call") throw new Error("Bradbury receipt has no decoded call data");
  const callData = decoded.callData;
  const method = mapValue(callData, "");
  const actualArgs = mapValue(callData, "args");
  const keys = callData instanceof Map ? Array.from(callData.keys()).map(String) : Object.keys(record(callData) ?? {});
  if (keys.length !== 2 || !keys.includes("") || !keys.includes("args") || mapValue(callData, "kwargs") !== undefined) {
    throw new Error("Bradbury receipt call data contains unexpected method or keyword arguments");
  }
  if (method !== expectation.functionName || !Array.isArray(actualArgs) ||
      !exactEqual(actualArgs, expectation.args)) {
    throw new Error("Bradbury receipt calldata does not exactly match the expected operation");
  }
  return receipt;
}
