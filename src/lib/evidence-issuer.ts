import { recoverMessageAddress } from "viem";
import { evidenceEnvelope,canonicalJson,sha256Digest } from "./claim-protocol";
import { matchesRiskSpec,riskSpecDigest } from "./risk-spec";

export function issuerMessage(envelope: unknown) {
  const parsed=evidenceEnvelope.parse(envelope);
  const unsigned={...parsed,issuer:{
    wallet:parsed.issuer.wallet.toLowerCase(),
    signed_at:parsed.issuer.signed_at,expires_at:parsed.issuer.expires_at,
  }};
  return "COVRA-ISSUER-EVIDENCE:"+sha256Digest(canonicalJson(unsigned));
}

/** A matching SHA-256 hash does not make claims authentic; an approved issuer's
 * signature and the frozen subject/reference must both match. */
export async function verifyIssuerEvidence(
  envelope:unknown,source:string,approvedIssuers:Record<string,string>,now=Math.floor(Date.now()/1000),
) {
  const parsed=evidenceEnvelope.parse(envelope);
  const url=new URL(source);
  if (url.protocol!=="https:"||url.username||url.password||url.port)
    throw new Error("Evidence must come from an uncredentialed HTTPS issuer");
  const host=url.hostname.toLowerCase();
  if (host!==parsed.risk_spec.evidenceIssuerHost) throw new Error("Issuer host differs from frozen risk");
  if (parsed.source_details.issuer_host.toLowerCase()!==host || parsed.source_details.endpoint!==source)
    throw new Error("Evidence source details do not match the retrieved HTTPS endpoint");
  if (parsed.source_details.origin_url) {
    const origin = new URL(parsed.source_details.origin_url);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.port)
      throw new Error("Evidence origin must be an uncredentialed HTTPS URL");
  }
  if (parsed.source_details.retrieval_method === "https_get" &&
      (!parsed.source_details.origin_url || !parsed.source_details.origin_payload_digest))
    throw new Error("Observed evidence must bind the fetched origin and response digest");
  if (parsed.source_details.provenance_class === "THIRD_PARTY_PUBLIC" &&
      (parsed.source_details.independent_observer_count ?? 0) < 2)
    throw new Error("Third-party provenance requires at least two declared observers");
  if (sha256Digest(canonicalJson(parsed.facts)).toLowerCase()!==parsed.source_details.source_payload_digest.toLowerCase())
    throw new Error("Evidence source payload digest does not match the signed facts");
  if (parsed.risk_spec_hash.toLowerCase()!==riskSpecDigest(parsed.risk_spec).toLowerCase())
    throw new Error("Insured risk digest does not match signed policy");
  if (!matchesRiskSpec(parsed.coverage_class,parsed.facts,parsed.risk_spec))
    throw new Error("Evidence does not identify precisely the insured exposure");
  const expected=approvedIssuers[host];
  if (!expected||expected.toLowerCase()!==parsed.issuer.wallet.toLowerCase())
    throw new Error("Independent issuer wallet is not approved for this host");
  if (parsed.issuer.signed_at>now+300||parsed.issuer.expires_at<=now||
      parsed.issuer.expires_at<=parsed.issuer.signed_at)
    throw new Error("Issuer observation expired or has an invalid timestamp");
  if (Date.parse(parsed.observed_at)>((now+300)*1000)) throw new Error("Issuer observation timestamp is in the future");
  const signer=await recoverMessageAddress({
    message:issuerMessage(parsed),signature:parsed.issuer.signature as `0x${string}`,
  });
  if (signer.toLowerCase()!==expected.toLowerCase())
    throw new Error("Issuer signature does not match approved wallet");
  return parsed;
}
