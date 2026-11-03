/** Audit staged blobs, never environment files. Prints only affected paths and rule names. */
import { execFileSync } from "node:child_process";
const files = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACM", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const findings = [];
const rules = [
  ["private key literal", /(?:private[_-]?key|signing[_-]?key)\s*[=:]\s*["'](?:0x)?[0-9a-f]{64}["']/i],
  ["credentialed database URL", /postgres(?:ql)?:\/\/[^\s:/]+:[^\s@]{4,}@/i],
  ["private key PEM", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub credential", /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{30,}/],
  ["Supabase secret", /\bsb_secret_[A-Za-z0-9_-]{20,}/],
];
for (const file of files) {
  if (/(^|\/)(?:\.env(?:\..+)?|node_modules|\.next|\.runtime|\.vercel)(?:\/|$)/.test(file) && file !== ".env.example") {
    findings.push({ file, rule: "excluded artifact or environment file" }); continue;
  }
  const source = execFileSync("git", ["show", ":" + file], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  for (const [name, pattern] of rules) if (pattern.test(source)) findings.push({ file, rule: name });
}
console.log("Staged files checked:", files.length, "credential-pattern findings:", findings.length);
for (const finding of findings) console.log(JSON.stringify(finding));
if (findings.length) process.exitCode = 1;
