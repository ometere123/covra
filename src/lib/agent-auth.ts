import type { NextRequest } from "next/server";
import { database, hasDatabase } from "./db";
import { hashKey } from "./auth";

export async function authenticateAgent(request: NextRequest, requiredScope: string) {
  if (!hasDatabase()) return null;
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer cvra_")) return null;
  const sql = database();
  const rows = await sql`
    select id, owner_wallet, scopes, max_daily_requests from agent_credentials
    where key_hash = ${hashKey(header.slice(7))}
      and revoked_at is null and expires_at > now()
    limit 1
  `;
  if (rows.length === 0) return null;
  const agent = rows[0];
  const scopes: string[] = Array.isArray(agent.scopes) ? agent.scopes : [];
  if (!scopes.includes(requiredScope)) return null;
  const usage = await sql`
    insert into agent_request_counts(agent_id,request_day,request_count)
    values (${agent.id}, current_date, 1)
    on conflict(agent_id,request_day)
      do update set request_count = agent_request_counts.request_count + 1
    returning request_count
  `;
  if (Number(usage[0].request_count) > Number(agent.max_daily_requests)) return null;
  await sql`update agent_credentials set last_used_at=now() where id=${agent.id}`;
  return { agentId: String(agent.id), ownerWallet: String(agent.owner_wallet) };
}
