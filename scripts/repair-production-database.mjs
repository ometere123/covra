/** Repair URL encoding in process memory; never changes the operator's file. */
import postgres from "postgres";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const raw = process.env.DATABASE_URL;
if (!raw) throw new Error("DATABASE_URL unavailable");
const match = /^(postgres(?:ql)?:\/\/)([^:]+):(.+)@([^/]+)(\/.*)$/s.exec(raw);
if (!match) throw new Error("DATABASE_URL structure cannot be safely repaired automatically");
let password = match[3];
try { password = decodeURIComponent(password); } catch { /* raw password */ }
const repaired = match[1] + match[2] + ":" + encodeURIComponent(password) + "@" + match[4] + match[5];
let url;
try { url = new URL(repaired); } catch { throw new Error("Database URL remains malformed after password encoding"); }
if (!url.hostname.includes("cxvgjycgojjcrmiyclga") && !url.username.includes("cxvgjycgojjcrmiyclga")) {
  throw new Error("Database identity does not match the verified COVRA Supabase project");
}
const sql = postgres(repaired, { max: 1, ssl: "require", connect_timeout: 10 });
try {
  await sql`select 1`;
  console.log("Authenticated COVRA application database connection verified");
  const root = execFileSync("npm.cmd", ["root", "-g"], { shell: true, encoding: "utf8" }).trim();
  const result = spawnSync(process.execPath, [join(root, "vercel/dist/vc.js"), "env", "add", "DATABASE_URL", "--environment", "production", "--type", "secret", "--force", "--yes"], { input: repaired, encoding: "utf8", timeout: 60000 });
  if (result.status !== 0) throw new Error("Vercel database secret update failed");
  console.log("Production DATABASE_URL stored as Vercel Secret");
} catch (error) {
  console.error("Database provisioning failed:", error.code || error.name);
  process.exitCode = 1;
} finally { await sql.end({ timeout: 1 }); }
