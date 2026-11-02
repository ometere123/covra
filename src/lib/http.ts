import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function responseError(error: unknown, defaultStatus = 400) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Validation failed", details: error.issues.map(i => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
  }
  const message = error instanceof Error ? error.message : "Unexpected request error";
  const status = /not configured|unavailable|Missing|not ready/i.test(message) ? 503 : defaultStatus;
  return NextResponse.json({ error: message }, { status });
}

export function testnetGuard() {
  if (process.env.COVRA_ENV !== "testnet") throw new Error("Financial issuance is disabled outside testnet until explicit security/legal release.");
}
