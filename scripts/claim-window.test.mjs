import assert from "node:assert/strict";
import test from "node:test";
import { assertIncidentWithinPolicy, parseIncidentTime, settlementCertificateDeadline } from "./claim-window.mjs";

const inception = BigInt(Date.parse("2026-10-30T10:00:00.000Z") / 1000);
const expiry = inception + 86400n;

test("accepts exact inception, end and timestamps within the insured window", () => {
  assert.equal(assertIncidentWithinPolicy("2026-10-30T10:00:00Z", inception, expiry), inception * 1000n);
  assert.equal(assertIncidentWithinPolicy("2026-10-30T12:30:00.500Z", inception, expiry), inception * 1000n + 9000500n);
  assert.equal(assertIncidentWithinPolicy("2026-10-31T10:00:00.000Z", inception, expiry), expiry * 1000n);
});

test("denies otherwise valid external evidence predating policy inception", () => {
  assert.throws(() => assertIncidentWithinPolicy("2026-10-30T09:59:59.999Z", inception, expiry), /outside/);
});

test("denies otherwise valid evidence after policy expiration", () => {
  assert.throws(() => assertIncidentWithinPolicy("2026-10-31T10:00:00.001Z", inception, expiry), /outside/);
});

test("rejects invalid and ambiguous timestamps, including timezone offsets", () => {
  for (const value of ["", "tomorrow", "2026-02-30T12:00:00Z", "2026-10-30T10:00:00+01:00",
    "2026-10-30T10:00:00.0Z", "2026-10-30T25:00:00Z", "2026-10-30T10:00:00Z extra"]) {
    assert.throws(() => parseIncidentTime(value));
  }
});

test("rejects a malformed Base policy coverage interval", () => {
  assert.throws(() => assertIncidentWithinPolicy("2026-10-30T10:00:00Z", expiry, inception), /outside/);
});

test("bounds the settlement signature by both the Base deadline and the evidence expiry", () => {
  assert.equal(settlementCertificateDeadline(200n, 151, 100), 150);
  assert.equal(settlementCertificateDeadline(140n, 151, 100), 140);
  assert.throws(() => settlementCertificateDeadline(200n, 101, 100), /expired/);
  assert.throws(() => settlementCertificateDeadline(2n ** 64n, 151, 100), /Unsafe/);
});
