import { EventEmitter } from "node:events";
import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { canonicalJson, sha256Digest } from "../src/lib/claim-protocol";
import { verifyIssuerEvidence } from "../src/lib/evidence-issuer";
import { riskSpecDigest } from "../src/lib/risk-spec";
import { POST } from "../src/app/api/evidence-issuer/issue/route";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn(), database: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ request: mocks.request }));
vi.mock("@/lib/db", () => ({ database: mocks.database }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

it("binds the real signed envelope in the intake transaction and keeps it on replay", async () => {
  // The source and database are isolated. The route, hashing and signatures are real.
  const key = `0x${"12".repeat(32)}` as const;
  const wallet = privateKeyToAccount(key).address;
  const host = "issuer.example.org";
  const sourceUrl = "https://source.example.org/incident.json";
  const claimId = "90567594-7fb1-4209-a1f9-71cd4babf0a0";
  const observationId = "isolated-incident";
  const referenceHash = sha256Digest("fixture");
  const eventTime = "2026-11-02T01:00:00.123Z";
  const risk = { coverageClass: 1, evidenceIssuerHost: host, subject: "fixture-provider", referenceHash, statement: "An isolated test coverage statement." };
  const observation = { observation_id: observationId, coverage_class: 1, event_time: eventTime,
    facts: { provider_id: risk.subject, monitoring_method_hash: referenceHash, outage_minutes: 60, independent_probes: 2 } };
  vi.stubEnv("COVRA_ENV", "testnet");
  vi.stubEnv("EVIDENCE_ISSUER_PRIVATE_KEY", key);
  vi.stubEnv("EVIDENCE_ISSUER_HOST", host);
  vi.stubEnv("EVIDENCE_ISSUER_ADMIN_TOKEN", "isolated-token");
  vi.stubEnv("EVIDENCE_ISSUER_TTL_SECONDS", "345600");
  mocks.lookup.mockResolvedValue([{ address: "93.184.215.14", family: 4 }]);
  mocks.request.mockImplementation((_url, options, receive) => {
    expect(options.agent).toBe(false);
    options.lookup("ignored", { family: 0, all: true }, (error: Error | null, addresses: unknown) => {
      expect(error).toBeNull();
      expect(addresses).toEqual([{ address: "93.184.215.14", family: 4 }]);
    });
    const request = new EventEmitter();
    return Object.assign(request, { end() {
      const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: { "content-type": "application/json" } });
      receive(response);
      response.emit("data", Buffer.from(JSON.stringify(observation)));
      response.emit("end");
    } });
  });

  const active = { status: "AWAITING_EVIDENCE", evidence_manifest_hash: null as string | null, base_lock_tx_hash: null };
  const tx = Object.assign(vi.fn(), { json: (value: unknown) => value });
  const sql = Object.assign(vi.fn().mockResolvedValue([{ ...active, policy_id: referenceHash, claimant_wallet: wallet,
    coverage_class: 1, incident_at: eventTime, terms_hash: referenceHash, risk_spec_hash: riskSpecDigest(risk), risk_spec_json: risk }]),
  { begin: vi.fn((run) => run(tx)) });
  mocks.database.mockReturnValue(sql);
  tx.mockResolvedValueOnce([active]).mockResolvedValueOnce([{ observation_id: observationId }]).mockResolvedValueOnce([]);
  const issue = () => POST(new NextRequest(`https://${host}/api/evidence-issuer/issue`, {
    method: "POST", headers: { authorization: "Bearer isolated-token" },
    body: JSON.stringify({ observationId, claimId, sourceUrl }),
  }));

  const first = await issue();
  const published = await first.json();
  expect(first.status).toBe(201);
  expect(published.claimBound).toBe(true);
  const envelope = tx.mock.calls[1][5];
  expect(await verifyIssuerEvidence(envelope, published.publicUrl, { [host]: wallet })).toMatchObject({ event_time: eventTime });
  expect(published.evidenceDigest).toBe(sha256Digest(canonicalJson(envelope)));
  expect(tx.mock.calls[2].slice(1)).toEqual([published.evidenceDigest, [published.publicUrl], claimId]);

  active.evidence_manifest_hash = published.evidenceDigest;
  tx.mockResolvedValueOnce([active]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ envelope, state: "ACTIVE",
    evidence_digest: published.evidenceDigest, expires_at: new Date(published.expiresAt * 1000), issuer_wallet: wallet }]);
  const replay = await issue();
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({ evidenceDigest: published.evidenceDigest, idempotentReplay: true });
  expect(tx).toHaveBeenCalledTimes(6);

  mocks.request.mockImplementationOnce((_url, _options, receive) => Object.assign(new EventEmitter(), { end() {
    const response = Object.assign(new EventEmitter(), { statusCode: 200 });
    receive(response);
    response.emit("aborted");
  } }));
  expect((await issue()).status).toBe(400);
  expect(sql.begin).toHaveBeenCalledTimes(2);
});
