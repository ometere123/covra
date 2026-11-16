import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  V3_EVIDENCE_REGISTRY, V3_EVIDENCE_METHOD, GITHUB_INCIDENTS_URL,
  evidenceRegistryDigest, evidenceMethodDigest, evidenceSha256, witnessMessage, verifyEvidenceWitnesses,
  parseGitHubStatusIncident, retrieveGitHubStatusIncident, type EvidenceRegistry, type FrozenEvidenceMethod,
} from "../src/lib/v3-evidence";

// Public test fixtures only.
const accounts = ["1", "2", "3"].map(digit => privateKeyToAccount(`0x${digit.repeat(64)}`));

async function witnesses(change?: (registry: EvidenceRegistry) => void) {
  const registry: EvidenceRegistry = {
    schema: V3_EVIDENCE_REGISTRY, revision: 1,
    operators: accounts.slice(0, 2).map(({ address }, i) => ({
      id: `op-${i}`, controlGroup: `owner-${i}`, signer: address, status: "INDEPENDENT_VERIFIED",
      reviewSha256: evidenceSha256(`review-${i}`), validFromMs: 100, validUntilMs: 3000,
    })),
    sources: [0, 1].map(i => ({
      id: `source-${i}`, operatorId: `op-${i}`, adapter: "signed-observation-v1",
      url: `https://observer-${i}.example/report`,
    })),
  };
  change?.(registry);
  const method: FrozenEvidenceMethod = {
    schema: V3_EVIDENCE_METHOD, registrySha256: evidenceRegistryDigest(registry), coverageClass: 1,
    subjectId: "github/actions", providerId: "github", sourceIds: registry.sources.map(s => s.id),
    minimumIndependentOperators: 2, excludedControlGroups: ["claimant"], maxObservationAgeMs: 200,
    retainThroughMs: 4000, fallback: "none", disagreement: "insufficient-evidence",
  };
  const frozenMethodSha256 = evidenceMethodDigest(method);
  const caseBinding = evidenceSha256("case/deployment/policy/incident/revision");
  const factsSha256 = evidenceSha256("independently derived facts");
  const observations = await Promise.all(method.sourceIds.map(async (sourceId, i) => {
    const rawBytes = Buffer.from(`observation ${i}`);
    const unsigned = { sourceId, rawBytes, rawSha256: evidenceSha256(rawBytes), retrievedAtMs: 1000, signature: "0x" as const };
    return { ...unsigned, signature: await accounts[i].signMessage({
      message: witnessMessage(frozenMethodSha256, caseBinding, factsSha256, unsigned),
    }) };
  }));
  return {
    registry, method, frozenMethodSha256, caseBinding, factsSha256, conflictingWallets: [accounts[2].address],
    observations, nowMs: 1100,
  };
}

describe("V3 witness provenance", () => {
  it("accepts two separately reviewed signed observations on the frozen method", async () => {
    expect(await verifyEvidenceWitnesses(await witnesses())).toBe(true);
  });

  it("rejects shared control across two domains, controlled tests and claimant wallets", async () => {
    expect(await verifyEvidenceWitnesses(await witnesses(r => {
      r.operators[1].controlGroup = r.operators[0].controlGroup;
    }))).toBe(false);
    expect(await verifyEvidenceWitnesses(await witnesses(r => {
      r.operators[0].status = "CONTROLLED_TEST";
    }))).toBe(false);
    const input = await witnesses();
    input.conflictingWallets.push(accounts[0].address);
    expect(await verifyEvidenceWitnesses(input)).toBe(false);
  });

  it("rejects altered policy bindings, conflicting facts, stale and missing observations", async () => {
    const input = await witnesses();
    expect(await verifyEvidenceWitnesses({ ...input, caseBinding: evidenceSha256("different revision") })).toBe(false);
    expect(await verifyEvidenceWitnesses({ ...input, factsSha256: evidenceSha256("conflicting facts") })).toBe(false);
    expect(await verifyEvidenceWitnesses({ ...input, nowMs: 1201 })).toBe(false);
    expect(await verifyEvidenceWitnesses({ ...input, observations: input.observations.slice(1) })).toBe(false);
    input.method.subjectId = "different subject";
    expect(await verifyEvidenceWitnesses(input)).toBe(false);
  });

  it("rejects changed source registration, changed raw bytes and unsigned observations", async () => {
    const input = await witnesses();
    const [first, second] = input.observations;
    expect(await verifyEvidenceWitnesses({
      ...input, observations: [{ ...first, rawBytes: Buffer.from("replacement") }, second],
    })).toBe(false);
    expect(await verifyEvidenceWitnesses({
      ...input, observations: [{ ...first, signature: "0x" }, second],
    })).toBe(false);
    input.registry.sources[0].url = "https://new-owner.example";
    expect(await verifyEvidenceWitnesses(input)).toBe(false);
  });
});

function githubFixture(startedAt = "2026-11-16T11:59:40.892Z") {
  const incidentId = "2zfqmghmg3s3";
  const componentId = "hhtssxt0f5v2";
  const rawBytes = Buffer.from(JSON.stringify({
    page: { id: "kctbh9vrtdwd" },
    incidents: [{
      id: incidentId, page_id: "kctbh9vrtdwd", status: "resolved", started_at: startedAt,
      resolved_at: "2026-11-16T16:26:26.775Z",
      incident_updates: [{ incident_id: incidentId, affected_components: [{ code: componentId }] }],
    }],
  }));
  return {
    sourceUrl: GITHUB_INCIDENTS_URL, retrievedAtMs: Date.parse("2026-11-17T00:00:00Z"),
    rawBytes, expectedSha256: evidenceSha256(rawBytes), incidentId, componentId,
  };
}

describe("GitHub raw provider adapter", () => {
  it("preserves committed raw bytes and labels the interval as provider-reported", () => {
    const fixture = githubFixture();
    expect(parseGitHubStatusIncident(fixture)).toMatchObject({
      authority: "PROVIDER_REPORTED", rawBytes: Uint8Array.from(fixture.rawBytes), rawSha256: fixture.expectedSha256,
      startedAtMs: Date.parse("2026-11-16T11:59:40.892Z"),
    });
  });

  it("rejects wrong subject, substituted origin, modified bytes and impossible timestamps", () => {
    const fixture = githubFixture();
    expect(() => parseGitHubStatusIncident({ ...fixture, componentId: "000000000000" })).toThrow();
    expect(() => parseGitHubStatusIncident({ ...fixture, sourceUrl: "https://githubstatus.example" })).toThrow();
    expect(() => parseGitHubStatusIncident({ ...fixture, rawBytes: Buffer.from("{}") })).toThrow();
    expect(() => parseGitHubStatusIncident(githubFixture("2026-11-31T11:59:40Z"))).toThrow();
  });

  it("fails closed when the live origin is unavailable", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));
    try {
      await expect(retrieveGitHubStatusIncident(githubFixture())).rejects.toThrow("feed unavailable");
      expect(fetchMock).toHaveBeenCalledWith(GITHUB_INCIDENTS_URL, expect.objectContaining({ redirect: "error" }));
    } finally {
      fetchMock.mockRestore();
    }
  });
});
