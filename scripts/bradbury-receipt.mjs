// Exact GenLayer receipt checks shared by independent attestor tooling.
// String inclusion is intentionally not used: method and every argument must match.
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
function get(value, key) { return value instanceof Map ? value.get(key) : object(value)?.[key]; }
function hex(bytes) { return "0x" + Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join(""); }
function comparable(value) {
  if (typeof value === "bigint") return { type: "number", value: value.toString() };
  if (typeof value === "number" && Number.isFinite(value)) return { type: "number", value: String(value) };
  if (typeof value === "string") return /^0x[0-9a-fA-F]+$/.test(value)
    ? { type: "hex", value: value.toLowerCase() } : { type: "string", value };
  if (value instanceof Uint8Array) return { type: "hex", value: hex(value) };
  if (Array.isArray(value)) return value.map(comparable);
  if (value instanceof Map) return Array.from(value.entries()).map(([key, entry]) => [String(key), comparable(entry)])
    .sort((left, right) => left[0].localeCompare(right[0]));
  const entry = object(value);
  if (entry) return Object.keys(entry).sort().map(key => [key, comparable(entry[key])]);
  return value;
}
function equal(left, right) { return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right)); }
function normalized(value) { return String(value ?? "").replaceAll("_", "").replaceAll("-", "").toUpperCase(); }

export function assertExactBradburyReceipt({ receipt, transactionHash, recipient, functionName, args }) {
  const data = object(receipt);
  if (!data) throw new Error("malformed Bradbury receipt");
  const ids = [data.id, data.txId, data.hash].filter(value => value !== undefined && value !== null);
  if (!ids.length || ids.some(value => String(value).toLowerCase() !== transactionHash.toLowerCase())) throw new Error("receipt identifier mismatch");
  const status = data.statusName ?? data.status;
  if ((typeof status === "number" && status !== 7) || (typeof status !== "number" && normalized(status) !== "FINALIZED")) throw new Error("receipt is not finalized");
  const execution = data.txExecutionResultName ?? data.txExecutionResult;
  if ((typeof execution === "number" && execution !== 1) || (typeof execution !== "number" && normalized(execution) !== "FINISHEDWITHRETURN")) throw new Error("execution did not finish with return");
  const destination = data.recipient ?? data.to_address;
  if (typeof destination !== "string" || destination.toLowerCase() !== recipient.toLowerCase()) throw new Error("receipt recipient mismatch");
  const decoded = object(data.txDataDecoded);
  if (!decoded || decoded.type !== "call") throw new Error("receipt has no decoded call");
  const callData = decoded.callData;
  const keys = callData instanceof Map ? Array.from(callData.keys()).map(String) : Object.keys(object(callData) ?? {});
  if (keys.length !== 2 || !keys.includes("") || !keys.includes("args") || get(callData, "kwargs") !== undefined) throw new Error("unexpected call shape");
  if (get(callData, "") !== functionName || !Array.isArray(get(callData, "args")) || !equal(get(callData, "args"), args)) throw new Error("exact calldata mismatch");
  return data;
}
