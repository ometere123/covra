import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { matchesBearerSecret } from "@/lib/bearer-secret";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { database } from "@/lib/db";
import {
  canonicalJson, canonicalTimestamp, claimIdFromUuid, evidenceEnvelope, sha256Digest,
  validateCoverageFacts,
} from "@/lib/claim-protocol";
import { riskSpecDigest, riskSpecSchema, matchesRiskSpec } from "@/lib/risk-spec";
import { issuerMessage } from "@/lib/evidence-issuer";
import { isPrivateNetworkAddress } from "@/lib/evidence-source";
import { responseError, testnetGuard } from "@/lib/http";

export const runtime = "nodejs";

const observationIdentity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/);
const inputSchema = z.object({
  observationId: observationIdentity,
  claimId: z.string().uuid(),
  sourceUrl: z.string().url(),
}).strict();
const sourceObservationSchema = z.object({
  observation_id: observationIdentity,
  coverage_class: z.number().int().min(0).max(4),
  event_time: canonicalTimestamp,
  facts: z.record(z.string(), z.unknown()),
}).strict();

const MAX_SOURCE_BYTES = 32 * 1024;

function issuerHost(): string {
  const host = String(process.env.EVIDENCE_ISSUER_HOST || "").trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host) || host.length > 253) {
    throw new Error("EVIDENCE_ISSUER_HOST must be a hostname without scheme, path or port");
  }
  return host;
}

async function safeSourceUrl(value: string, ownHost: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) {
    throw new Error("The observation source must be an uncredentialed HTTPS URL");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === ownHost || hostname === "localhost" || hostname.endsWith(".localhost") || isPrivateNetworkAddress(hostname)) {
    throw new Error("The observation source must be a public host distinct from the COVRA issuer");
  }
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateNetworkAddress(address))) {
    throw new Error("The observation source resolves to a private or otherwise unsafe network address");
  }
  return url;
}

async function retrieveObservation(url: URL) {
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateNetworkAddress(address))) {
    throw new Error("Observation source resolves to a private or otherwise unsafe network address");
  }
  // Pin the already-validated DNS answer for the request. A second, implicit
  // resolver lookup could otherwise be changed between validation and fetch.
  const response = await new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; bytes: Uint8Array }>((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (!settled) { settled = true; reject(error); }
    };
    const request = httpsRequest(url, {
      method: "GET",
      headers: { accept: "application/json" },
      servername: url.hostname,
      signal: AbortSignal.timeout(10_000),
      agent: false,
      lookup: (_hostname, options, callback) => {
        const family = typeof options.family === "number" ? options.family : 0;
        const matching = addresses.filter((entry) => family === 0 || entry.family === family);
        if (!matching.length) return callback(new Error("No validated address matches the requested IP family"), "", 0);
        if (options.all) return callback(null, matching);
        callback(null, matching[0].address, matching[0].family);
      },
    }, (incoming) => {
      const status = incoming.statusCode || 0;
      if (status < 200 || status >= 300) {
        incoming.resume();
        fail(new Error(`Observation source returned HTTP ${status}`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      incoming.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_SOURCE_BYTES) {
          request.destroy(new Error("Observation source response is too large"));
          return;
        }
        chunks.push(chunk);
      });
      incoming.on("end", () => {
        if (settled) return;
        settled = true;
        resolve({ status, headers: incoming.headers as Record<string, string | string[] | undefined>, bytes: new Uint8Array(Buffer.concat(chunks)) });
      });
      incoming.on("aborted", () => fail(new Error("Observation source response was interrupted")));
      incoming.on("error", fail);
    });
    request.on("error", fail);
    request.end();
  });
  const contentType = String(response.headers["content-type"] || "").toLowerCase();
  if (!contentType.includes("json")) throw new Error("Observation source must return JSON");
  const declaredLength = Number(response.headers["content-length"] || 0);
  if (declaredLength > MAX_SOURCE_BYTES) throw new Error("Observation source response is too large");
  const bytes = response.bytes;
  if (bytes.length > MAX_SOURCE_BYTES) throw new Error("Observation source response is too large");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("Observation source returned invalid JSON");
  }
  return { observation: sourceObservationSchema.parse(parsed), rawDigest: sha256Digest(bytes) };
}

function ttlSeconds(): number {
  const value = Number(process.env.EVIDENCE_ISSUER_TTL_SECONDS || 110 * 86400);
  if (!Number.isInteger(value) || value < 4 * 86400 || value > 120 * 86400) {
    throw new Error("Evidence issuer TTL must be between 4 and 120 days");
  }
  return value;
}

export async function POST(request: NextRequest) {
  try {
    testnetGuard();
    // The original admin token remains the normal operational credential. A
    // separately managed demo token may be enabled for a disclosed testnet
    // pilot when Vercel's protected production secrets cannot be injected into
    // a local operator process. Both paths use the same constant-time bearer
    // comparison and neither token is returned to the browser or logs.
    const authorized = [process.env.EVIDENCE_ISSUER_ADMIN_TOKEN, process.env.EVIDENCE_ISSUER_DEMO_TOKEN]
      .some((secret) => matchesBearerSecret(request.headers.get("authorization"), secret));
    if (!authorized) {
      return NextResponse.json({ error: "Evidence issuer authorization required" }, { status: 401 });
    }
    const privateKey = process.env.EVIDENCE_ISSUER_PRIVATE_KEY;
    if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("Dedicated evidence issuer key is not configured");
    const host = issuerHost();
    const body = inputSchema.parse(await request.json());
    const sourceUrl = await safeSourceUrl(body.sourceUrl, host);
    const { observation, rawDigest } = await retrieveObservation(sourceUrl);
    if (observation.observation_id !== body.observationId) throw new Error("Observation identity does not match the requested record");

    const sql = database();
    const rows = await sql`select c.id,c.policy_id,c.claimant_wallet,c.coverage_class,c.incident_at,
      c.evidence_manifest_hash,p.terms_hash,p.risk_spec_hash,prs.risk_spec_json
      from claims c join policies p on p.policy_id=c.policy_id
      join policy_risk_specs prs on prs.policy_id=p.policy_id and prs.risk_spec_hash=p.risk_spec_hash
      where c.id=${body.claimId} and c.status not in ('CANCELLED','PAID','DENIED','EXPIRED') limit 1`;
    if (!rows.length) return NextResponse.json({ error: "Active claim and frozen policy risk were not found" }, { status: 404 });
    const claim = rows[0];
    const riskSpec = riskSpecSchema.parse(typeof claim.risk_spec_json === "string" ? JSON.parse(claim.risk_spec_json) : claim.risk_spec_json);
    if (Number(claim.coverage_class) !== Number(riskSpec.coverageClass) ||
        observation.coverage_class !== Number(claim.coverage_class) ||
        String(claim.risk_spec_hash).toLowerCase() !== riskSpecDigest(riskSpec).toLowerCase() ||
        String(riskSpec.evidenceIssuerHost).toLowerCase() !== host) {
      throw new Error("Frozen claim risk does not authorize this observation");
    }
    if (!matchesRiskSpec(Number(claim.coverage_class), observation.facts, riskSpec)) {
      throw new Error("Observed facts do not identify precisely the insured exposure");
    }
    if (!validateCoverageFacts(Number(claim.coverage_class), observation.facts)) {
      throw new Error("Observed facts do not satisfy the mandatory coverage-class evidence schema");
    }
    const incidentAt = new Date(observation.event_time).getTime();
    if (!Number.isFinite(incidentAt) || incidentAt !== new Date(claim.incident_at).getTime() || incidentAt > Date.now() + 300_000) {
      throw new Error("Observed event time is inconsistent with the claim intake");
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const now = Math.floor(Date.now() / 1000);
    const source = `https://${host}/api/evidence-issuer/observations/${encodeURIComponent(body.observationId)}`;
    const expiresAt = now + ttlSeconds();
    const unsigned = {
      schema: "covra-evidence" as const,
      policy_id: String(claim.policy_id).toLowerCase(),
      claim_id: claimIdFromUuid(body.claimId, String(claim.claimant_wallet).toLowerCase()),
      terms_hash: String(claim.terms_hash).toLowerCase(),
      risk_spec_hash: String(claim.risk_spec_hash).toLowerCase(),
      risk_spec: riskSpec,
      coverage_class: Number(claim.coverage_class),
      observation_id: body.observationId,
      event_time: new Date(incidentAt).toISOString(),
      observed_at: new Date().toISOString(),
      observation_mode: "OBSERVED_PUBLIC" as const,
      source_details: {
        issuer_host: host,
        endpoint: source,
        retrieval_method: "https_get" as const,
        source_payload_digest: sha256Digest(canonicalJson(observation.facts)),
        origin_url: sourceUrl.toString(),
        origin_payload_digest: rawDigest,
      },
      issuer: { wallet: account.address.toLowerCase(), signed_at: now, expires_at: expiresAt, signature: `0x${"0".repeat(130)}` },
      facts: observation.facts,
    };
    const parsed = evidenceEnvelope.parse(unsigned);
    const signature = await account.signMessage({ message: issuerMessage(parsed) });
    const envelope = evidenceEnvelope.parse({ ...parsed, issuer: { ...parsed.issuer, signature } });
    const digest = sha256Digest(canonicalJson(envelope));
    return await sql.begin(async (tx) => {
      const [active] = await tx`select status, evidence_manifest_hash, base_lock_tx_hash
        from claims where id=${body.claimId} for update`;
      if (!active || ['CANCELLED','PAID','DENIED','EXPIRED'].includes(String(active.status))) {
        return NextResponse.json({ error: "The claim is no longer active" }, { status: 409 });
      }
      const bindDraft = active.evidence_manifest_hash === null;
      if (bindDraft && (active.status !== 'AWAITING_EVIDENCE' || active.base_lock_tx_hash)) {
        return NextResponse.json({ error: "Only an unanchored evidence-pending intake can be bound" }, { status: 409 });
      }
      const inserted = await tx`insert into evidence_issuer_observations(
        observation_id,coverage_class,evidence_digest,issuer_wallet,envelope,issued_at,expires_at
      ) values(
        ${body.observationId},${Number(claim.coverage_class)},${digest},${account.address.toLowerCase()},
        ${tx.json(JSON.parse(JSON.stringify(envelope)))},${new Date(now * 1000).toISOString()},${new Date(expiresAt * 1000).toISOString()}
      ) on conflict (observation_id) do nothing returning observation_id`;
      let publishedDigest = digest;
      let publishedWallet: string = account.address;
      let publishedExpiry = expiresAt;
      if (!inserted.length) {
        const [prior] = await tx`select evidence_digest,issuer_wallet,envelope,state,expires_at
          from evidence_issuer_observations where observation_id=${body.observationId} for update`;
        const stored = evidenceEnvelope.safeParse(prior?.envelope);
        if (!stored.success || stored.data.claim_id !== envelope.claim_id ||
            stored.data.source_details.origin_url !== sourceUrl.toString() ||
            stored.data.source_details.origin_payload_digest !== rawDigest) {
          return NextResponse.json({ error: "Observation identity is already bound to different content" }, { status: 409 });
        }
        if (prior.state !== "ACTIVE" || new Date(prior.expires_at).getTime() <= Date.now()) {
          return NextResponse.json({ error: "The observation is inactive" }, { status: 409 });
        }
        publishedDigest = sha256Digest(canonicalJson(stored.data));
        if (publishedDigest !== prior.evidence_digest) throw new Error("Stored observation digest mismatch");
        publishedWallet = String(prior.issuer_wallet);
        publishedExpiry = stored.data.issuer.expires_at;
      }
      if (bindDraft) {
        await tx`update claims set evidence_manifest_hash=${publishedDigest},
          evidence_urls=${tx.json([source])},updated_at=now() where id=${body.claimId}`;
      }
      return NextResponse.json({
        observationId: body.observationId, evidenceDigest: publishedDigest, issuerWallet: publishedWallet,
        publicUrl: source, observationMode: "OBSERVED_PUBLIC", expiresAt: publishedExpiry,
        originUrl: sourceUrl.toString(), claimBound: bindDraft,
        ...(!inserted.length ? { idempotentReplay: true } : {}),
      }, { status: inserted.length ? 201 : 200 });
    });
  } catch (error) {
    return responseError(error);
  }
}
