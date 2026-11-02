import { NextResponse } from "next/server";
import { walletSession } from "@/lib/auth";

export async function GET() {
  const wallet = await walletSession();
  return NextResponse.json({ authenticated: Boolean(wallet), wallet }, { headers: { "Cache-Control": "no-store" } });
}
