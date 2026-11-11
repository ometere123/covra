const claimId = process.argv[2];
const sourceUrl = process.argv[3];
const observationId = "class0-covra-service-failure-pilot-2026-11-11-01";
if (!/^[0-9a-fA-F-]{36}$/.test(claimId || "") || !/^https:\/\//.test(sourceUrl || "")) {
  throw new Error("Usage: issue-hosted-class0-evidence.mjs <claim UUID> <immutable raw observation URL>");
}
const token = process.env.EVIDENCE_ISSUER_ADMIN_TOKEN;
if (!token) throw new Error("EVIDENCE_ISSUER_ADMIN_TOKEN is unavailable to this protected process");
const response = await fetch("https://covra-lyart.vercel.app/api/evidence-issuer/issue", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ observationId, claimId, sourceUrl }),
});
const body = await response.json();
console.log(JSON.stringify({ status: response.status, body }, null, 2));
if (!response.ok) process.exitCode = 1;
