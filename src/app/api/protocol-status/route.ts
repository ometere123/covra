import { NextResponse } from "next/server";
import { readProtocolStatus } from "@/lib/protocol-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await readProtocolStatus();
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
