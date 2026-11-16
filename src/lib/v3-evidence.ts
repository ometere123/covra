import { createHash } from "node:crypto";
import { getAddress, verifyMessage, type Address, type Hex } from "viem";

export const V3_EVIDENCE_REGISTRY = "covra-evidence-registry-v1";
export const V3_EVIDENCE_METHOD = "covra-evidence-method-v1";
export const GITHUB_INCIDENTS_URL = "https://www.githubstatus.com/api/v2/incidents.json";
const MAX_GITHUB_FEED_BYTES = 1024 * 1024;

export type EvidenceOperator = {
  id: string;
  controlGroup: string;
  signer: Address;
  status: "INDEPENDENT_VERIFIED" | "CONTROLLED_TEST" | "UNVERIFIED" | "CONFLICTED";
  reviewSha256: string;
  validFromMs: number;
  validUntilMs: number;
};

export type EvidenceSource = {
  id: string;
  operatorId: string;
  adapter: "github-statuspage-v1" | "signed-observation-v1";
  url: string;
};

export type EvidenceRegistry = {
  schema: typeof V3_EVIDENCE_REGISTRY;
  revision: number;
  operators: EvidenceOperator[];
  sources: EvidenceSource[];
};

export type FrozenEvidenceMethod = {
  schema: typeof V3_EVIDENCE_METHOD;
  registrySha256: string;
  coverageClass: 0 | 1 | 2 | 3 | 4;
  subjectId: string;
  providerId: string;
  sourceIds: string[];
  minimumIndependentOperators: number;
  excludedControlGroups: string[];
  maxObservationAgeMs: number;
  retainThroughMs: number;
  fallback: "none";
  disagreement: "insufficient-evidence";
};

export function evidenceSha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// Fixed positional encodings avoid object key-order and extension ambiguity.
export function evidenceRegistryDigest(registry: EvidenceRegistry): string {
  return evidenceSha256(JSON.stringify([
    registry.schema, registry.revision,
    registry.operators.map(o => [
      o.id, o.controlGroup, getAddress(o.signer), o.status, o.reviewSha256, o.validFromMs, o.validUntilMs,
    ]),
    registry.sources.map(s => [s.id, s.operatorId, s.adapter, s.url]),
  ]));
}

export function evidenceMethodDigest(method: FrozenEvidenceMethod): string {
  return evidenceSha256(JSON.stringify([
    method.schema, method.registrySha256, method.coverageClass, method.subjectId, method.providerId,
    method.sourceIds, method.minimumIndependentOperators, method.excludedControlGroups,
    method.maxObservationAgeMs, method.retainThroughMs, method.fallback, method.disagreement,
  ]));
}

export type WitnessObservation = {
  sourceId: string;
  retrievedAtMs: number;
  rawBytes: Uint8Array;
  rawSha256: string;
  signature: Hex;
};

export function witnessMessage(
  methodSha256: string, caseBinding: string, factsSha256: string, observation: WitnessObservation,
): string {
  return JSON.stringify([
    "covra-witness-v1", methodSha256, caseBinding, factsSha256,
    observation.sourceId, observation.retrievedAtMs, observation.rawSha256,
  ]);
}

const isHash = (s: string) => /^[0-9a-f]{64}$/.test(s) && !/^0+$/.test(s);
const isTime = (n: number) => Number.isSafeInteger(n) && n >= 0;
const unique = (values: string[]) => new Set(values).size === values.length;

/**
 * Inputs must come from trusted policy/chain reads: method commitment, bound case,
 * conflicting identities and verified facts. A passing quorum verifies signed
 * provenance only. The caller must independently derive facts from each origin.
 * An authenticated operator review is represented by its frozen registry entry.
 */
export async function verifyEvidenceWitnesses(input: {
  registry: EvidenceRegistry;
  method: FrozenEvidenceMethod;
  frozenMethodSha256: string;
  caseBinding: string;
  factsSha256: string;
  conflictingWallets: readonly Address[];
  nowMs: number;
  observations: WitnessObservation[];
}): Promise<boolean> {
  try {
    const { registry, method, observations, nowMs } = input;
    if (registry.schema !== V3_EVIDENCE_REGISTRY || method.schema !== V3_EVIDENCE_METHOD ||
        !Number.isSafeInteger(registry.revision) || registry.revision < 1 ||
        !Number.isInteger(method.coverageClass) || method.coverageClass < 0 || method.coverageClass > 4 ||
        method.fallback !== "none" || method.disagreement !== "insufficient-evidence" ||
        !method.subjectId || !method.providerId ||
        !isHash(input.caseBinding) || !isHash(input.factsSha256) ||
        evidenceMethodDigest(method) !== input.frozenMethodSha256 ||
        evidenceRegistryDigest(registry) !== method.registrySha256 ||
        !isTime(nowMs) || !isTime(method.retainThroughMs) || nowMs > method.retainThroughMs ||
        !isTime(method.maxObservationAgeMs) || method.maxObservationAgeMs === 0 ||
        !Number.isSafeInteger(method.minimumIndependentOperators) ||
        method.minimumIndependentOperators < 2 || method.sourceIds.length > 16 ||
        !unique(method.sourceIds) || !unique(registry.operators.map(o => o.id)) ||
        !unique(registry.sources.map(s => s.id)) ||
        input.conflictingWallets.length === 0 || observations.length > method.sourceIds.length) return false;

    const conflicts = new Set(input.conflictingWallets.map(wallet => getAddress(wallet)));
    const groups = new Set<string>();
    const signers = new Set<string>();
    const sources = new Set<string>();
    const origins = new Set<string>();
    for (const observation of observations) {
      const source = registry.sources.find(s => s.id === observation.sourceId);
      const operator = registry.operators.find(o => o.id === source?.operatorId);
      if (!source || !operator || !method.sourceIds.includes(source.id) || sources.has(source.id) ||
          source.adapter !== "signed-observation-v1" || operator.status !== "INDEPENDENT_VERIFIED" ||
          !isHash(operator.reviewSha256) || !operator.controlGroup ||
          method.excludedControlGroups.includes(operator.controlGroup) ||
          !isTime(operator.validFromMs) || !isTime(operator.validUntilMs) ||
          !isTime(observation.retrievedAtMs) || observation.retrievedAtMs > nowMs ||
          nowMs - observation.retrievedAtMs > method.maxObservationAgeMs ||
          observation.retrievedAtMs < operator.validFromMs || nowMs > operator.validUntilMs ||
          observation.rawBytes.length === 0 || observation.rawBytes.length > 262144 ||
          evidenceSha256(observation.rawBytes) !== observation.rawSha256) return false;
      const url = new URL(source.url);
      const signer = getAddress(operator.signer);
      if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash ||
          origins.has(url.origin) || conflicts.has(signer) || signers.has(signer) ||
          groups.has(operator.controlGroup) || !await verifyMessage({
            address: signer,
            message: witnessMessage(input.frozenMethodSha256, input.caseBinding, input.factsSha256, observation),
            signature: observation.signature,
          })) return false;
      origins.add(url.origin);
      groups.add(operator.controlGroup);
      signers.add(signer);
      sources.add(source.id);
    }
    return groups.size >= method.minimumIndependentOperators;
  } catch {
    return false;
  }
}

function timestamp(value: unknown): number {
  if (typeof value !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) throw new Error("invalid timestamp");
  const ms = Date.parse(value);
  const normalized = value.replace(/(?:\.(\d{1,3}))?Z$/, (_, digits) => `.${(digits ?? "").padEnd(3, "0")}Z`);
  if (!isTime(ms) || new Date(ms).toISOString() !== normalized) throw new Error("invalid timestamp");
  return ms;
}

/**
 * Maps GitHub's public incident list to a provider-reported incident interval.
 * Affected-component mentions and the incident interval establish neither
 * component downtime duration nor independent corroboration.
 */
export function parseGitHubStatusIncident(input: {
  sourceUrl: string;
  retrievedAtMs: number;
  rawBytes: Uint8Array;
  expectedSha256: string;
  incidentId: string;
  componentId: string;
}) {
  if (input.sourceUrl !== GITHUB_INCIDENTS_URL || !isTime(input.retrievedAtMs) ||
      input.rawBytes.length === 0 || input.rawBytes.length > MAX_GITHUB_FEED_BYTES ||
      evidenceSha256(input.rawBytes) !== input.expectedSha256 ||
      !/^[a-z0-9]{12}$/.test(input.incidentId) || !/^[a-z0-9]{12}$/.test(input.componentId)) {
    throw new Error("invalid GitHub source commitment");
  }
  const rawBytes = Uint8Array.from(input.rawBytes);
  const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBytes));
  if (data?.page?.id !== "kctbh9vrtdwd" || !Array.isArray(data.incidents)) throw new Error("invalid GitHub feed");
  const incidents = data.incidents.filter((item: { id?: string } | null) => item?.id === input.incidentId);
  const incident = incidents[0];
  if (incidents.length !== 1 || incident.page_id !== data.page.id || incident.status !== "resolved" ||
      !Array.isArray(incident.incident_updates) || !incident.incident_updates.some(
        (update: { incident_id?: string; affected_components?: { code?: string }[] } | null) =>
          update?.incident_id === input.incidentId && Array.isArray(update.affected_components) &&
          update.affected_components.some(component => component?.code === input.componentId),
      )) throw new Error("no resolved incident for insured component");
  const startedAtMs = timestamp(incident.started_at);
  const resolvedAtMs = timestamp(incident.resolved_at);
  if (startedAtMs >= resolvedAtMs || resolvedAtMs > input.retrievedAtMs) throw new Error("invalid incident interval");
  return {
    schema: "covra-provider-report-v1" as const,
    authority: "PROVIDER_REPORTED" as const,
    providerId: "github",
    sourceUrl: input.sourceUrl,
    retrievedAtMs: input.retrievedAtMs,
    rawBytes,
    rawSha256: input.expectedSha256,
    incidentId: input.incidentId,
    componentId: input.componentId,
    startedAtMs,
    resolvedAtMs,
  };
}

/** Retrieve the fixed provider feed. Missing or changed bytes fail verification. */
export async function retrieveGitHubStatusIncident(input: {
  expectedSha256: string;
  incidentId: string;
  componentId: string;
}) {
  const response = await fetch(GITHUB_INCIDENTS_URL, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok || response.url !== GITHUB_INCIDENTS_URL || !response.body ||
      response.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    await response.body?.cancel();
    throw new Error("GitHub status feed unavailable");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_GITHUB_FEED_BYTES) throw new Error("GitHub status feed exceeds size limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return parseGitHubStatusIncident({
    ...input, rawBytes: Buffer.concat(chunks), sourceUrl: GITHUB_INCIDENTS_URL, retrievedAtMs: Date.now(),
  });
}
