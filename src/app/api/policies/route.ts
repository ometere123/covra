import { NextRequest, NextResponse } from "next/server";
import { walletSession } from "@/lib/auth";
import { authenticateAgent } from "@/lib/agent-auth";
import { database, hasDatabase } from "@/lib/db";

export async function GET(request: NextRequest) {
  const wallet = await walletSession();
  const agent = wallet ? null : await authenticateAgent(request, "policy:read");
  const owner = wallet || agent?.ownerWallet;
  if (!owner) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({
    source: "none",
    state: "DATABASE_UNAVAILABLE",
    items: [],
    message: "The reconciled policy index is not configured; no policy rows are available.",
  }, { headers: { "Cache-Control": "no-store" } });
  const sql = database();
  const rows = await sql`select p.*,r.risk_spec_json from policies p
    left join policy_risk_specs r on r.policy_id=p.policy_id and r.risk_spec_hash=p.risk_spec_hash
    where lower(p.owner_wallet)=${owner.toLowerCase()}
    order by p.created_at desc limit 200`;
  return NextResponse.json({ source: "supabase_reconciled_index", state: "CONFIRMED", items: rows }, { headers: { "Cache-Control": "no-store" } });
}
