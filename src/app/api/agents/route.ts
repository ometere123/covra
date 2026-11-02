import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { walletSession, hashKey, newAgentKey } from "@/lib/auth";
import { hasDatabase, database } from "@/lib/db";
import { responseError } from "@/lib/http";

export async function GET() {
  const owner = await walletSession();
  if (!owner) return NextResponse.json({ error: "Wallet authentication required" }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({
    source: "none",
    state: "DATABASE_UNAVAILABLE",
    items: [],
    message: "Agent credentials require the server database; no credentials are available.",
  }, { headers: { "Cache-Control": "no-store" } });
  const sql = database();
  const rows = await sql`
    select id,label,scopes,max_daily_requests,created_at,last_used_at,expires_at,revoked_at
    from agent_credentials where lower(owner_wallet)=${owner} order by created_at desc limit 100
  `;
  return NextResponse.json({ source: "supabase", state: "CONFIRMED", items: rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    const owner = await walletSession();
    if (!owner) return NextResponse.json({ error: "Wallet authentication required" }, { status: 401 });
    if (!hasDatabase()) throw new Error("Database not configured");
    const body = z.object({
      label: z.string().trim().min(3).max(120),
      scopes: z.array(z.enum(["quote:read", "quote:issue", "policy:read", "claim:read", "claim:issue"])).min(1).max(5),
      expiresInDays: z.number().int().min(1).max(90).default(30),
      maxDailyRequests: z.number().int().min(1).max(10000).default(1000),
    }).parse(await request.json());
    const rawKey = newAgentKey();
    const sql = database();
    const rows = await sql`
      insert into agent_credentials(owner_wallet,label,key_hash,scopes,max_daily_requests,expires_at)
      values (${owner},${body.label},${hashKey(rawKey)},${JSON.stringify(body.scopes)}::jsonb,
              ${body.maxDailyRequests}, now() + (${body.expiresInDays} * interval '1 day'))
      returning id,label,scopes,expires_at
    `;
    await sql`insert into audit_events(actor_wallet,action,resource_id,payload_hash)
      values (${owner},'AGENT_CREDENTIAL_CREATED',${String(rows[0].id)},${hashKey(rawKey)})`;
    return NextResponse.json({ agent: rows[0], secret: rawKey, warning: "This credential is displayed ONCE; store it privately." }, { status: 201 });
  } catch (error) {
    return responseError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const owner = await walletSession();
    if (!owner) return NextResponse.json({ error: "Wallet authentication required" }, { status: 401 });
    const id = z.string().uuid().parse(new URL(request.url).searchParams.get("id"));
    const sql = database();
    const rows = await sql`update agent_credentials set revoked_at=now()
      where id=${id} and lower(owner_wallet)=${owner} and revoked_at is null returning id`;
    if (!rows.length) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    return NextResponse.json({ revoked: true });
  } catch (error) {
    return responseError(error);
  }
}
