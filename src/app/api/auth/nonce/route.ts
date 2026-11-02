import { NextRequest, NextResponse } from "next/server";
import { createChallenge, setNonceCookie } from "@/lib/auth";
import { responseError } from "@/lib/http";
import { z } from "zod";

export async function POST(request: NextRequest) {
  try {
    const payload = z.object({ address: z.string() }).parse(await request.json());
    const challenge = createChallenge(payload.address, new URL(request.url).origin);
    await setNonceCookie(challenge);
    return NextResponse.json({ message: challenge.message, expiresInSeconds: 600 });
  } catch (error) {
    return responseError(error);
  }
}
