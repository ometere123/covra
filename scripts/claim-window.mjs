/**
 * Independent settlement eligibility: UTC incident time must lie inside the
 * immutable Base coverage interval. Never rely on the web-app intake check:
 * owners may submit claims directly to both chains without using the API.
 */
export function parseIncidentTime(value) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    throw new Error("Incident timestamp must be canonical UTC ISO-8601");
  }
  const millis = Date.parse(value);
  if (!Number.isSafeInteger(millis)) throw new Error("Incident timestamp is not representable");
  const normalized = new Date(millis).toISOString();
  if (value !== normalized && value !== normalized.replace(/\.000Z$/, "Z")) {
    throw new Error("Invalid or noncanonical incident timestamp");
  }
  return BigInt(millis);
}

export function assertIncidentWithinPolicy(eventTime, startsAt, endsAt) {
  const incidentMs = parseIncidentTime(eventTime);
  const firstMs = BigInt(startsAt) * 1000n;
  const lastMs = BigInt(endsAt) * 1000n;
  if (firstMs >= lastMs || incidentMs < firstMs || incidentMs > lastMs) {
    throw new Error("Incident is outside the immutable policy coverage period");
  }
  return incidentMs;
}
