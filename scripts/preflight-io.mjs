/** Shared wire format for independent preflight and signing processes. */
export function encodePreflightOutput(result) {
  return JSON.stringify(result, null, 2) + "\n";
}

export function parsePreflightOutput(output) {
  const result = JSON.parse(output);
  if (!result || result.status !== "SOURCE_CHECKS_PASSED_NOT_SIGNABLE" || !result.decision) {
    throw new Error("Independent preflight did not produce a usable candidate");
  }
  return result;
}
