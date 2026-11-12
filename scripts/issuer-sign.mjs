/** Independent issuer utility: sign a published observation, not a claimant's opinion.
 * stdin: draft JSON evidence excluding issuer. stdout: canonical signed JSON.
 * stderr: SHA-256 of exact stdout evidence bytes (without newline).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { parseIncidentTime } from "./claim-window.mjs";

const canonical=value=>Array.isArray(value)?"["+value.map(canonical).join(",")+"]":
  value&&typeof value==="object"?"{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}":JSON.stringify(value);
const hash=value=>"0x"+createHash("sha256").update(value).digest("hex");

async function main() {
  const secret=process.env.EVIDENCE_ISSUER_PRIVATE_KEY;
  if (!/^0x[0-9a-fA-F]{64}$/.test(secret||"")) throw new Error("EVIDENCE_ISSUER_PRIVATE_KEY required in isolated issuer environment");
  const issuer=privateKeyToAccount(secret);
  const draft=JSON.parse(readFileSync(0,"utf8"));
  if (!draft||typeof draft!=="object"||draft.schema!=="covra-evidence"||draft.issuer)
    throw new Error("Provide a validated unsigned COVRA evidence envelope on stdin");
  parseIncidentTime(draft.event_time);
  if (!/^[0-9a-fA-F]{64}$/.test(String(draft.risk_spec_hash||"").replace(/^0x/,"")) ||
      !draft.risk_spec||draft.risk_spec.coverageClass!==draft.coverage_class ||
      !draft.facts || typeof draft.facts!=="object" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(String(draft.observation_id||"")) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(String(draft.observed_at||"")) ||
      draft.observation_mode !== "OBSERVED_PUBLIC" ||
      !draft.source_details || draft.source_details.issuer_host !== draft.risk_spec.evidenceIssuerHost ||
      !/^https:\/\//.test(String(draft.source_details.endpoint||"")) ||
      draft.source_details.retrieval_method !== "https_get" ||
      !/^https:\/\//.test(String(draft.source_details.origin_url||"")) ||
      !/^[0-9a-fA-F]{64}$/.test(String(draft.source_details.origin_payload_digest||"").replace(/^0x/,"")) ||
      !["THIRD_PARTY_PUBLIC","COVRA_CONTROLLED","CLAIMANT_CONTROLLED","UNKNOWN"].includes(draft.source_details.provenance_class) ||
      !Number.isInteger(draft.source_details.independent_observer_count) ||
      draft.source_details.independent_observer_count < 0 || draft.source_details.independent_observer_count > 16 ||
      typeof draft.source_details.source_authority !== "string" ||
      draft.source_details.source_authority.length < 2 || draft.source_details.source_authority.length > 240 ||
      String(draft.source_details.source_payload_digest||"").toLowerCase()!==hash(canonical(draft.facts)).toLowerCase())
    throw new Error("Observed public HTTPS evidence, frozen insured-risk hash and class facts are required");
  const frozenHash=hash(JSON.stringify({
    coverageClass:draft.risk_spec.coverageClass,
    evidenceIssuerHost:draft.risk_spec.evidenceIssuerHost,
    referenceHash:String(draft.risk_spec.referenceHash).toLowerCase(),
    statement:draft.risk_spec.statement,subject:draft.risk_spec.subject,
  }));
  if (frozenHash.toLowerCase()!==draft.risk_spec_hash.toLowerCase())
    throw new Error("Issuer signing request changes the frozen insured risk");
  const issuerHost=String(process.env.EVIDENCE_ISSUER_HOST||"").trim().toLowerCase();
  if (!issuerHost||issuerHost!==draft.risk_spec.evidenceIssuerHost)
    throw new Error("Issuer must explicitly own the exact frozen evidence hostname");
  const bindings={
    0:["task_id","task_spec_hash"],1:["provider_id","monitoring_method_hash"],
    2:["agent_id","mandate_hash"],3:["protocol_id","exposure_hash"],
    4:["operation_id","baseline_hash"],
  }[draft.coverage_class];
  if(!bindings||draft.facts[bindings[0]]!==draft.risk_spec.subject||
      String(draft.facts[bindings[1]]||"").toLowerCase()!==String(draft.risk_spec.referenceHash).toLowerCase())
    throw new Error("Evidence does not identify the exact insured event and reference");
  const now=Math.floor(Date.now()/1000);
  // Claims have a 3-day appeal and a bounded 105-day maximum settlement
  // window. A one-hour issuer signature would expire before finalization.
  const ttl=Number(process.env.EVIDENCE_ISSUER_TTL_SECONDS||110*86400);
  if(!Number.isSafeInteger(ttl)||ttl<4*86400||ttl>120*86400)
    throw new Error("Issuer validity must cover appeal, between 4 and 120 days");
  const unsigned={...draft,issuer:{wallet:issuer.address.toLowerCase(),signed_at:now,expires_at:now+ttl}};
  const signature=await issuer.signMessage({message:"COVRA-ISSUER-EVIDENCE:"+hash(canonical(unsigned))});
  const bytes=canonical({...unsigned,issuer:{...unsigned.issuer,signature}});
  process.stdout.write(bytes);
  process.stderr.write("Signed evidence SHA-256: "+hash(bytes)+"\n");
}
main().catch(error=>{console.error(error.message||String(error));process.exitCode=1;});
