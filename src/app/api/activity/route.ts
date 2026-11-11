import { NextRequest, NextResponse } from "next/server";
import { walletSession } from "@/lib/auth";
import { database, hasDatabase } from "@/lib/db";
import { configuredPoolAddress } from "@/lib/chain";
import { indexerStream } from "@/lib/indexer-stream";
import { normalizeCapitalHistoryRow } from "@/lib/capital-history";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const wallet = await walletSession();
  if (!wallet) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ source: "none", state: "DATABASE_UNAVAILABLE", items: [], message: "The reconciled activity index is not configured." }, { headers: { "Cache-Control": "no-store" } });
  const pool = configuredPoolAddress();
  if (!pool) return NextResponse.json({ source: "none", state: "UNAVAILABLE", items: [], message: "The Base pool deployment is not configured." }, { headers: { "Cache-Control": "no-store" } });
  try {
    const sql = database();
    const rows = await sql`select chain_id,tx_hash,log_index,event_type,block_number,block_timestamp,created_at,payload
      from claim_chain_events
      where chain_id=84532 and event_type in ('CapitalDeposited','CapitalWithdrawn')
        and lower(payload->>'underwriter')=${wallet.toLowerCase()}
      order by coalesce(block_timestamp,created_at) desc, block_number desc, log_index desc limit 200`;
    const cursor = await sql`select last_block,last_block_hash,updated_at from indexer_cursors where stream=${indexerStream(pool)} limit 1`;
    const items = rows.map(row => normalizeCapitalHistoryRow(row as Record<string, unknown>)).filter((row): row is NonNullable<typeof row> => row !== null);
    return NextResponse.json({ source: "supabase_reconciled_index", state: "CONFIRMED", items, cursor: cursor[0] || null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ source: "supabase_reconciled_index", state: "SYNCHRONIZATION_ERROR", items: [], message: "Capital activity could not be read from the reconciled index." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
