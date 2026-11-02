import { NextRequest, NextResponse } from "next/server";
import { canonicalJson } from "@/lib/claim-protocol";
import { database } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ observationId: string }> }) {
  const { observationId } = await context.params;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(observationId)) {
    return NextResponse.json({ error: "Invalid observation identity" }, { status: 400 });
  }
  try {
    const rows = await database()`select observation_id,evidence_digest,envelope,state,expires_at
      from evidence_issuer_observations where observation_id=${observationId} limit 1`;
    if (!rows.length) return NextResponse.json({ error: "Observation not found" }, { status: 404 });
    const row = rows[0];
    if (row.state !== "ACTIVE" || new Date(String(row.expires_at)).getTime() <= Date.now()) {
      return NextResponse.json({ error: "Observation is no longer active", observationId, state: row.state }, { status: 410 });
    }
    const body = canonicalJson(row.envelope);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-covra-evidence-digest": String(row.evidence_digest),
      },
    });
  } catch {
    return NextResponse.json({ error: "Evidence store unavailable" }, { status: 503 });
  }
}
